use serde::{Deserialize, Serialize};

pub mod commands;

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub assets: Vec<ReleaseAsset>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::fetch_openclaw_releases,
            commands::clawhub_search,
            commands::download_openclaw,
            commands::install_openclaw,
            commands::get_install_path,
            commands::run_gateway,
            commands::stop_all_gateways,
            commands::get_onboard_help,
            commands::run_onboard,
            commands::install_skills_tools,
            commands::write_openclaw_config,
            commands::read_openclaw_config,
            commands::open_url,
            commands::wait_for_local_port,
            commands::get_build_info,
            commands::clean_openclaw_temp,
            commands::fetch_models_from_provider,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
