use crate::GitHubRelease;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter};

const GITHUB_API_RELEASES: &str = "https://api.github.com/repos/supaclaw/openclaw/releases";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub loaded: u64,
    pub total: Option<u64>,
    pub done: bool,
}

#[tauri::command]
pub async fn fetch_openclaw_releases() -> Result<Vec<GitHubRelease>, String> {
    let client = reqwest::Client::builder()
        .user_agent("OpenClaw-Desktop-Wizard/1.0")
        .build()
        .map_err(|e| e.to_string())?;

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
) -> Result<PathBuf, String> {
    let releases = fetch_openclaw_releases().await?;
    let release = releases
        .into_iter()
        .find(|r| r.tag_name == version)
        .ok_or_else(|| format!("Release {} not found", version))?;

    let asset = release
        .assets
        .into_iter()
        .find(|a| a.name == asset_name)
        .ok_or_else(|| format!("Asset {} not found", asset_name))?;

    let url = asset.browser_download_url;
    let client = reqwest::Client::builder()
        .user_agent("OpenClaw-Desktop-Wizard/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Download failed: {}", resp.status()));
    }

    let total = resp.content_length();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    let download_dir = dirs::download_dir().ok_or("Could not find Downloads directory")?;
    let file_path = download_dir.join(&asset_name);

    tokio::fs::write(&file_path, &bytes)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("download-progress", DownloadProgress {
        loaded: bytes.len() as u64,
        total,
        done: true,
    });

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
    std::fs::create_dir_all(&install_path).map_err(|e| e.to_string())?;

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    if ext.eq_ignore_ascii_case("zip") {
        let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let out_path = install_path.join(entry.name());
            if entry.name().ends_with('/') {
                std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = out_path.parent() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
                let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    } else if ext.eq_ignore_ascii_case("exe") {
        // For .exe installer we just note where it is; user can run it or we run it
        // Copy exe to install dir for "portable" style
        let dest = install_path.join(path.file_name().unwrap_or_default());
        std::fs::copy(&path, &dest).map_err(|e| e.to_string())?;
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

#[tauri::command]
pub async fn run_gateway(_app: AppHandle, install_dir: String) -> Result<(), String> {
    let base = PathBuf::from(&install_dir);
    let exe_path = find_openclaw_exe(&base)
        .ok_or_else(|| "openclaw.exe not found in install directory".to_string())?;
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

/// Install skills and tools via openclaw CLI (e.g. openclaw skills install / openclaw tools install).
#[tauri::command]
pub async fn install_skills_tools(_app: AppHandle, install_dir: String) -> Result<(), String> {
    let base = PathBuf::from(&install_dir);
    let exe_path = find_openclaw_exe(&base)
        .ok_or_else(|| "openclaw.exe not found in install directory".to_string())?;
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
pub async fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}