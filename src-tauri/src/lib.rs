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

    // Signal handler: SIGTERM (kill <pid>, Activity Monitor "Force Quit",
    // OS shutdown) and SIGINT (Ctrl-C in dev). Tauri's RunEvent::Exit fires
    // for the graceful Cmd+Q / window-close path but NOT for signals, so
    // without this hook a `killall ProxyOrbit` would leave HTTP_PROXY set
    // and break every new terminal until the user logs out. SIGKILL still
    // can't be intercepted — that's what the startup orphan-detect covers.
    let _ = ctrlc::set_handler(|| {
        system_proxy::cleanup_on_exit();
        std::process::exit(0);
    });

    let app = tauri::Builder::default()
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
            system_proxy::has_orphaned_proxy_env,
            system_proxy::force_clear_proxy_env,
        ])
        .build(tauri::generate_context!())
        .expect("error while running ProxyOrbit");

    // Best-effort cleanup on exit. RunEvent::Exit fires for the Cmd+Q /
    // window-close path; signal-killed or panic-killed processes won't reach
    // here, which is why we ALSO have the startup orphan-detect on the
    // frontend side. Together they cover everything except SIGKILL between
    // launches with no fresh launch happening before the user opens a
    // terminal.
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            system_proxy::cleanup_on_exit();
        }
    });
}
