mod commands;

use commands::{proxy, settings, system_proxy};
use proxy::ProxyState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            settings::get_settings,
            settings::save_settings,
            system_proxy::get_network_service,
            system_proxy::set_system_proxy,
            system_proxy::unset_system_proxy,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ProxyOrbit");
}
