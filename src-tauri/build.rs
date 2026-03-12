fn main() {
    // Provide git metadata for the app UI (best-effort; falls back to "unknown").
    // We keep this lightweight and avoid extra deps.
    fn git(args: &[&str]) -> Option<String> {
        let out = std::process::Command::new("git").args(args).output().ok()?;
        if !out.status.success() {
            return None;
        }
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    }

    if let Some(commit) = git(&["rev-parse", "--short=8", "HEAD"]) {
        println!("cargo:rustc-env=GIT_COMMIT_HASH={}", commit);
    }
    if let Some(date) = git(&["show", "-s", "--format=%cI", "HEAD"]) {
        println!("cargo:rustc-env=GIT_COMMIT_DATE={}", date);
    }
    if let Some(status) = git(&["status", "--porcelain"]) {
        let dirty = (!status.trim().is_empty()).to_string();
        println!("cargo:rustc-env=GIT_DIRTY={}", dirty);
    }

    // Re-run if git metadata changes.
    println!("cargo:rerun-if-changed=.git/HEAD");
    println!("cargo:rerun-if-changed=.git/index");
    println!("cargo:rerun-if-changed=.git/refs");

    tauri_build::build()
}
