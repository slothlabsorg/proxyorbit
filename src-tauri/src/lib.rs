mod ca;
mod commands;

use commands::{proxy, settings, system_proxy};
use proxy::ProxyState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // rustls with the `ring` feature requires an explicit default provider
    // install before any `ServerConfig::builder()` call. Doing it once at
    // startup is cheap and idempotent.
    if rustls::crypto::ring::default_provider().install_default().is_err() {
        // Already installed by another code path — fine.
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ProxyState::default())
        .invoke_handler(tauri::generate_handler![
            proxy::start_proxy,
            proxy::stop_proxy,
            proxy::get_proxy_status,
            proxy::list_entries,
            proxy::clear_entries,
            proxy::delete_entry,
            proxy::set_intercepting,
            proxy::replay_request,
            proxy::set_mitm_enabled,
            proxy::get_ca_pem,
            proxy::get_ca_pem_path,
            proxy::set_mitm_bypass_hosts,
            settings::get_settings,
            settings::save_settings,
            system_proxy::get_network_service,
            system_proxy::set_system_proxy,
            system_proxy::unset_system_proxy,
            system_proxy::get_system_proxy_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ProxyOrbit");
}
