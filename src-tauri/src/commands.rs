use crate::GitHubRelease;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};
use std::fs;
use sysinfo::System;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use serde_json::Value as JsonValue;

const GITHUB_API_RELEASES: &str = "https://api.github.com/repos/supaclaw/openclaw/releases";

fn is_sharing_violation(err: &std::io::Error) -> bool {
    // Windows "The process cannot access the file because it is being used by another process."
    // surfaces as raw_os_error = 32.
    err.raw_os_error() == Some(32)
}

fn retry_io<T>(mut f: impl FnMut() -> std::io::Result<T>) -> std::io::Result<T> {
    let mut last_err: Option<std::io::Error> = None;
    // ~3 seconds total (common for AV scans to release).
    for attempt in 0..15 {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) if is_sharing_violation(&e) && attempt < 14 => {
                last_err = Some(e);
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            Err(e) => return Err(e),
        }
    }
    Err(last_err.unwrap_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "I/O failed")))
}

fn unique_dest_path(dir: &std::path::Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let base = dir.join(file_name);
    if !base.exists() {
        return base;
    }
    let stem = std::path::Path::new(file_name)
        .file_stem()
        .unwrap_or(file_name)
        .to_os_string();
    let ext = std::path::Path::new(file_name).extension().map(|e| e.to_os_string());
    for i in 1..1000u32 {
        let mut candidate_name = stem.clone();
        candidate_name.push(format!("-{}", i));
        let mut p = dir.join(candidate_name);
        if let Some(ext) = ext.as_deref() {
            p.set_extension(ext);
        }
        if !p.exists() {
            return p;
        }
    }
    base
}

fn build_http_client(proxy_url: Option<&str>) -> Result<reqwest::Client, String> {
    // Some corporate proxies (or MITM appliances) return incorrect `Content-Encoding`
    // headers (commonly gzip), which causes reqwest to fail with "error decoding response body".
    // For our use-cases (JSON + binary downloads), it's safe to force identity encoding.
    let mut default_headers = reqwest::header::HeaderMap::new();
    default_headers.insert(
        reqwest::header::ACCEPT_ENCODING,
        reqwest::header::HeaderValue::from_static("identity"),
    );

    let mut builder = reqwest::Client::builder()
        .user_agent("OpenClaw-Desktop-Wizard/1.0")
        .default_headers(default_headers)
        // Avoid indefinite hangs on connect / TLS handshake / stalled transfers.
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(10 * 60))
        .tcp_keepalive(std::time::Duration::from_secs(30));
    if let Some(url) = proxy_url {
        let url = url.trim();
        if !url.is_empty() {
            let proxy = reqwest::Proxy::all(url).map_err(|e| e.to_string())?;
            builder = builder.proxy(proxy);
        }
    }
    builder.build().map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub loaded: u64,
    pub total: Option<u64>,
    pub done: bool,
}

fn emit_download_log(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit("download-log", message.into());
}

#[tauri::command]
pub async fn fetch_openclaw_releases(proxy_url: Option<String>) -> Result<Vec<GitHubRelease>, String> {
    let client = build_http_client(proxy_url.as_deref())?;

    let resp = client
        .get(GITHUB_API_RELEASES)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    let releases: Vec<GitHubRelease> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(releases)
}

#[tauri::command]
pub async fn download_openclaw(
    app: AppHandle,
    version: String,
    asset_name: String,
    proxy_url: Option<String>,
    download_url: Option<String>,
    username: Option<String>,
    password: Option<String>,
) -> Result<PathBuf, String> {
    let client = build_http_client(proxy_url.as_deref())?;

    emit_download_log(
        &app,
        format!(
            "Starting download. version={} asset={} proxy={} custom_url={}",
            version,
            asset_name,
            proxy_url.as_deref().unwrap_or("<none>"),
            download_url.as_deref().unwrap_or("<none>")
        ),
    );

    let (url, file_name) = if let Some(u) = download_url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let parsed = reqwest::Url::parse(u).map_err(|e| format!("Invalid download URL: {}", e))?;
        let fname = parsed
            .path_segments()
            .and_then(|mut segs| segs.next_back())
            .filter(|s| !s.is_empty())
            .unwrap_or("openclaw-download.bin")
            .to_string();
        (u.to_string(), fname)
    } else {
        let releases = fetch_openclaw_releases(proxy_url.clone()).await?;
        let release = releases
            .into_iter()
            .find(|r| r.tag_name == version)
            .ok_or_else(|| format!("Release {} not found", version))?;

        let asset = release
            .assets
            .into_iter()
            .find(|a| a.name == asset_name)
            .ok_or_else(|| format!("Asset {} not found", asset_name))?;

        (asset.browser_download_url, asset.name)
    };

    emit_download_log(&app, format!("Requesting URL: {}", url));

    let mut req = client.get(&url);
    let user = username.as_deref().map(str::trim).unwrap_or("");
    if !user.is_empty() {
        req = req.basic_auth(user.to_string(), password.clone());
        emit_download_log(&app, format!("Using HTTP Basic Auth (username={})", user));
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Download failed: {}", resp.status()));
    }

    let total = resp.content_length();
    emit_download_log(
        &app,
        format!(
            "Response OK. content_length={}",
            total.map(|t| t.to_string()).unwrap_or_else(|| "<unknown>".into())
        ),
    );

    let download_dir = dirs::download_dir().ok_or("Could not find Downloads directory")?;
    let file_path = download_dir.join(&file_name);

    // Stream to disk and emit progress, instead of buffering the whole response in memory.
    let tmp_path = file_path.with_extension("part");
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| e.to_string())?;

    let mut loaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    let mut last_emit = std::time::Instant::now();

    use futures_util::StreamExt;
    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| e.to_string())?;
        if chunk.is_empty() {
            continue;
        }
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        loaded = loaded.saturating_add(chunk.len() as u64);

        // Emit at most ~4 times/sec to avoid flooding the UI.
        if last_emit.elapsed() >= std::time::Duration::from_millis(250) {
            let _ = app.emit(
                "download-progress",
                DownloadProgress {
                    loaded,
                    total,
                    done: false,
                },
            );
            last_emit = std::time::Instant::now();
        }
    }

    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    tokio::fs::rename(&tmp_path, &file_path)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            loaded,
            total,
            done: true,
        },
    );
    emit_download_log(&app, format!("Download complete: {}", file_path.display()));

    Ok(file_path)
}

#[tauri::command]
pub async fn get_install_path() -> Result<PathBuf, String> {
    let local_app_data = std::env::var("LOCALAPPDATA").or_else(|_| std::env::var("APPDATA"));
    let base = local_app_data.map(PathBuf::from).unwrap_or_else(|_| {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
    });
    Ok(base.join("OpenClaw"))
}

#[tauri::command]
pub async fn install_openclaw(
    _app: AppHandle,
    archive_path: String,
    install_dir: String,
) -> Result<(), String> {
    let path = PathBuf::from(&archive_path);
    if !path.exists() {
        return Err("Downloaded file not found".to_string());
    }

    let install_path = PathBuf::from(&install_dir);
    retry_io(|| std::fs::create_dir_all(&install_path)).map_err(|e| e.to_string())?;

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    if ext.eq_ignore_ascii_case("zip") {
        let file = retry_io(|| std::fs::File::open(&path)).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let out_path = install_path.join(entry.name());
            if entry.name().ends_with('/') {
                retry_io(|| std::fs::create_dir_all(&out_path)).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = out_path.parent() {
                    retry_io(|| std::fs::create_dir_all(p)).map_err(|e| e.to_string())?;
                }
                let mut out = retry_io(|| std::fs::File::create(&out_path)).map_err(|e| e.to_string())?;
                retry_io(|| std::io::copy(&mut entry, &mut out).map(|_| ())).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    } else if ext.eq_ignore_ascii_case("exe") {
        // If the file is already in the install directory, don't try to copy it (avoids locks/overwrite).
        let src_dir = path.parent().map(PathBuf::from);
        if src_dir.as_deref() == Some(&install_path) {
            return Ok(());
        }

        // Copy exe to install dir. Avoid overwriting existing/locked files by picking a unique name.
        let file_name = path.file_name().unwrap_or_default();
        let dest = unique_dest_path(&install_path, file_name);
        retry_io(|| std::fs::copy(&path, &dest).map(|_| ())).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Unsupported archive type: {}", ext))
    }
}

fn find_openclaw_exe(base: &std::path::Path) -> Option<PathBuf> {
    let exe = base.join("openclaw.exe");
    if exe.exists() {
        return Some(exe);
    }
    if let Ok(entries) = std::fs::read_dir(base) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                if let Some(found) = find_openclaw_exe(&p) {
                    return Some(found);
                }
            } else if p.file_name().and_then(|n| n.to_str()) == Some("openclaw.exe") {
                return Some(p);
            }
        }
    }
    None
}

fn collect_openclaw_like_exes(base: &std::path::Path, acc: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(base) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                collect_openclaw_like_exes(&p, acc);
                continue;
            }
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let lower = name.to_ascii_lowercase();
            if lower.ends_with(".exe") && lower.starts_with("openclaw") {
                acc.push(p);
            }
        }
    }
}

fn resolve_openclaw_exe(
    install_dir: &str,
    downloaded_path: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(p) = downloaded_path.map(str::trim).filter(|s| !s.is_empty()) {
        let pb = PathBuf::from(p);
        let is_exe = pb
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("exe"))
            .unwrap_or(false);
        if is_exe && pb.exists() {
            return Ok(pb);
        }
    }

    let base = PathBuf::from(install_dir);
    if let Some(found) = find_openclaw_exe(&base) {
        return Ok(found);
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    collect_openclaw_like_exes(&base, &mut candidates);
    if candidates.is_empty() {
        return Err("openclaw executable not found (checked downloaded path and install directory)".to_string());
    }
    candidates.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
    Ok(candidates[0].clone())
}

#[tauri::command]
pub async fn run_gateway(
    _app: AppHandle,
    install_dir: String,
    downloaded_path: Option<String>,
) -> Result<(), String> {
    let exe_path = resolve_openclaw_exe(&install_dir, downloaded_path.as_deref())?;
    let cwd = exe_path
        .parent()
        .ok_or("Invalid exe path")?;
    Command::new(&exe_path)
        .args(["gateway"])
        .current_dir(cwd)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn stop_all_gateways() -> Result<u32, String> {
    let mut sys = System::new_all();
    sys.refresh_processes();

    let mut killed: u32 = 0;
    for (_pid, proc_) in sys.processes() {
        let name = proc_.name().to_ascii_lowercase();
        if !name.contains("openclaw") || name.contains("desktop") {
            continue;
        }
        let cmd = proc_.cmd();
        let is_gateway = cmd.iter().any(|a| a.eq_ignore_ascii_case("gateway"));
        if !is_gateway {
            continue;
        }
        if proc_.kill() {
            killed = killed.saturating_add(1);
        }
    }

    Ok(killed)
}

#[tauri::command]
pub async fn get_onboard_help(
    _app: AppHandle,
    install_dir: String,
    downloaded_path: Option<String>,
) -> Result<String, String> {
    let exe_path = resolve_openclaw_exe(&install_dir, downloaded_path.as_deref())?;
    let cwd = exe_path.parent().ok_or("Invalid exe path")?;

    let out = Command::new(&exe_path)
        .args(["onboard", "--help"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;

    let mut s = String::new();
    if !out.stdout.is_empty() {
        s.push_str(&String::from_utf8_lossy(&out.stdout));
    }
    if !out.stderr.is_empty() {
        if !s.is_empty() {
            s.push('\n');
        }
        s.push_str(&String::from_utf8_lossy(&out.stderr));
    }
    if s.trim().is_empty() {
        return Err("No help output from `openclaw onboard --help`".to_string());
    }
    Ok(s)
}

#[tauri::command]
pub async fn run_onboard(
    _app: AppHandle,
    install_dir: String,
    downloaded_path: Option<String>,
    args: Vec<String>,
) -> Result<(), String> {
    let mut cmd;
    let cwd;

    let install_dir_trimmed = install_dir.trim();
    let downloaded_trimmed = downloaded_path.as_deref().map(str::trim).filter(|s| !s.is_empty());

    if install_dir_trimmed.is_empty() && downloaded_trimmed.is_none() {
        // Fallback: try to run `openclaw` from PATH when no install directory or downloaded path
        // is provided. This supports users who installed OpenClaw separately and just want to
        // run onboarding via the CLI on PATH.
        cmd = Command::new("openclaw");
        cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    } else {
        let exe_path = resolve_openclaw_exe(&install_dir, downloaded_trimmed)?;
        cwd = exe_path.parent().ok_or("Invalid exe path")?.to_path_buf();
        cmd = Command::new(&exe_path);
    }

    cmd.arg("onboard");
    cmd.arg("--non-interactive");
    for a in args {
        let trimmed = a.trim();
        if !trimmed.is_empty() {
            cmd.arg(trimmed);
        }
    }
    let output = cmd
        .current_dir(&cwd)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                // Friendlier message when the executable cannot be found at all.
                "openclaw executable not found (not installed or not on PATH; complete the install steps first)".to_string()
            } else {
                e.to_string()
            }
        })?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut ok = output.status.success();

    // Special-case: onboarding succeeded in writing config but failed while
    // probing a local gateway (e.g. abnormal WebSocket closure). In this case
    // we still want the desktop wizard to proceed as long as the config file
    // was written.
    if !ok
        && stderr.contains("Config overwrite:")
        && stderr.contains("Error: gateway closed")
    {
        ok = true;
    }

    if !ok {
        let code = output.status.code().unwrap_or(-1);
        let mut msg = format!("openclaw onboard --non-interactive failed (exit code {code})");
        if !stderr.trim().is_empty() {
            msg.push_str(" - stderr: ");
            msg.push_str(stderr.trim());
        } else if !stdout.trim().is_empty() {
            msg.push_str(" - stdout: ");
            msg.push_str(stdout.trim());
        }
        return Err(msg);
    }

    Ok(())
}

/// Install skills and tools via openclaw CLI (e.g. openclaw skills install / openclaw tools install).
#[tauri::command]
pub async fn install_skills_tools(
    _app: AppHandle,
    install_dir: String,
    downloaded_path: Option<String>,
) -> Result<(), String> {
    let exe_path = resolve_openclaw_exe(&install_dir, downloaded_path.as_deref())?;
    let cwd = exe_path.parent().ok_or("Invalid exe path")?;
    // Run skills/tools install if the CLI supports it
    let _ = Command::new(&exe_path)
        .args(["skills", "install"])
        .current_dir(cwd)
        .spawn();
    let _ = Command::new(&exe_path)
        .args(["tools", "install"])
        .current_dir(cwd)
        .spawn();
    Ok(())
}

#[tauri::command]
pub async fn write_openclaw_config(
    _app: AppHandle,
    install_dir: String,
    config: JsonValue,
) -> Result<(), String> {
    let _ = install_dir; // kept for API compatibility; config is stored in user profile

    let home = dirs::home_dir().ok_or_else(|| "Could not determine user home directory".to_string())?;
    let config_dir = home.join(".openclaw");
    retry_io(|| std::fs::create_dir_all(&config_dir)).map_err(|e| e.to_string())?;

    let target = config_dir.join("openclaw.json");
    let tmp = target.with_extension("json.part");

    let data = serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?;

    retry_io(|| std::fs::write(&tmp, &data)).map_err(|e| e.to_string())?;
    retry_io(|| std::fs::rename(&tmp, &target)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn read_openclaw_config() -> Result<String, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not determine user home directory".to_string())?;
    let config_path = home.join(".openclaw").join("openclaw.json");
    if !config_path.exists() {
        return Ok(String::from("{\n}\n"));
    }
    let data = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn wait_for_local_port(port: u16, timeout_ms: Option<u64>) -> Result<(), String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30_000));
    let deadline = Instant::now() + timeout;
    let addr = format!("127.0.0.1:{}", port);

    let mut last_err: Option<String> = None;
    while Instant::now() < deadline {
        match tokio::net::TcpStream::connect(&addr).await {
            Ok(stream) => {
                drop(stream);
                return Ok(());
            }
            Err(e) => {
                last_err = Some(e.to_string());
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
        }
    }

    Err(format!(
        "Gateway did not start listening on {} within {}ms{}",
        addr,
        timeout.as_millis(),
        last_err
            .as_deref()
            .map(|e| format!(" (last error: {})", e))
            .unwrap_or_default()
    ))
}

fn delete_openclaw_temp_entries(root: &std::path::Path, removed: &mut u32, had_error: &mut Option<String>) {
    let is_caxa_root = root
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case("caxa"))
        .unwrap_or(false);

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_ascii_lowercase(),
                None => continue,
            };

            let is_openclaw = name.contains("openclaw");

            // Under a caxa root, treat everything as OpenClaw-related temp.
            let should_delete = is_openclaw || is_caxa_root;

            if should_delete {
                let res = if path.is_dir() {
                    fs::remove_dir_all(&path)
                } else {
                    fs::remove_file(&path)
                };

                match res {
                    Ok(_) => {
                        *removed = removed.saturating_add(1);
                    }
                    Err(e) => {
                        *had_error = Some(e.to_string());
                    }
                }

                // If we just deleted a directory, don't recurse into it.
                if path.is_dir() {
                    continue;
                }
            }

            if path.is_dir() {
                delete_openclaw_temp_entries(&path, removed, had_error);
            }
        }
    }
}

#[tauri::command]
pub async fn clean_openclaw_temp() -> Result<u32, String> {
    let mut removed: u32 = 0;
    let mut had_error: Option<String> = None;

    // Prefer LOCALAPPDATA\Temp when available; fall back to system temp dir.
    let temp_root = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|p| p.join("Temp"))
        .filter(|p| p.is_dir())
        .unwrap_or_else(|| std::env::temp_dir());

    if !temp_root.is_dir() {
        return Err(format!(
            "Temp directory does not exist: {}",
            temp_root.display()
        ));
    }

    // Special-case: if a top-level `caxa` temp directory exists under LOCALAPPDATA\Temp,
    // try to remove it entirely (this is where OpenClaw's packaged runtime tends to live).
    let caxa_root = temp_root.join("caxa");
    if caxa_root.is_dir() {
        match fs::remove_dir_all(&caxa_root) {
            Ok(_) => {
                removed = removed.saturating_add(1);
            }
            Err(e) => {
                // Best-effort only; remember last error but do not fail the whole command.
                had_error = Some(e.to_string());
            }
        }
    }

    // Also recursively clean any other OpenClaw-related temp artifacts.
    delete_openclaw_temp_entries(&temp_root, &mut removed, &mut had_error);

    // We intentionally do not bubble up partial failures (e.g. access denied on files
    // that are still in use). The UI can rely on the returned count and the user can
    // close running OpenClaw processes if they want a more thorough cleanup.
    let _ = had_error;

    Ok(removed)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildInfo {
    pub version: String,
    pub commit: String,
    pub dirty: bool,
    pub commit_date: Option<String>,
}

#[tauri::command]
pub async fn get_build_info() -> Result<BuildInfo, String> {
    let version = env!("CARGO_PKG_VERSION").to_string();
    let commit = option_env!("GIT_COMMIT_HASH")
        .unwrap_or("unknown")
        .to_string();
    let dirty = option_env!("GIT_DIRTY")
        .and_then(|s| s.parse::<bool>().ok())
        .unwrap_or(false);
    let commit_date = option_env!("GIT_COMMIT_DATE").map(|s| s.to_string());

    Ok(BuildInfo {
        version,
        commit,
        dirty,
        commit_date,
    })
}