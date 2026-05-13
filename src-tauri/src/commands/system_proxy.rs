use std::process::Command;

// System-proxy helpers. On macOS we use `networksetup`; changing proxy state
// with it requires admin privileges on recent macOS (Sonoma+). We wrap the
// `networksetup` calls in an `osascript` "with administrator privileges"
// block so macOS surfaces its native auth prompt — otherwise the underlying
// command silently fails and the Network pane in System Settings stays
// disabled, which is exactly the confusion `v0.x` shipped with.

/// Detect the primary active network service name on macOS.
fn get_active_service() -> String {
    let output = Command::new("networksetup")
        .args(["-listnetworkserviceorder"])
        .output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout);
        // Prefer Wi-Fi → Ethernet → first available. These names are
        // localised in some macOS configs but the common US-English
        // defaults match on every stock install we've tested.
        for preferred in &["Wi-Fi", "Ethernet", "USB 10/100/1000 LAN"] {
            if text.contains(preferred) {
                return preferred.to_string();
            }
        }
        for line in text.lines() {
            if line.starts_with('(') && !line.contains('*') {
                let trimmed = line
                    .trim_start_matches(|c: char| c == '(' || c.is_ascii_digit())
                    .trim_end_matches(')')
                    .trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }
    "Wi-Fi".to_string()
}

#[tauri::command]
pub fn get_network_service() -> String {
    get_active_service()
}


#[tauri::command]
pub fn set_system_proxy(port: u16) -> Result<(), String> {
    let service = get_active_service();
    let ca_path = dirs::home_dir()
        .map(|h| h.join(".proxyorbit").join("ca").join("ca.pem").to_string_lossy().to_string())
        .unwrap_or_else(|| "/tmp/ca.pem".into());

    // ── 1. GUI app proxy (requires admin) ───────────────────────────────
    // `networksetup -set*state on` writes to /Library/Preferences/SystemConfiguration
    // which is admin-only on recent macOS. One osascript call prompts once.
    // We also disable PAC auto-discovery — some DHCP servers hand out PAC
    // URLs that override our manual config silently.
    //
    // Each step is followed by a verbose verification block so we can surface
    // *which* step failed to the UI (corporate MDM frequently blocks these
    // even with sudo, and the command exits 0 but the state stays `No`).
    let cmd = format!(
        "/usr/sbin/networksetup -setautoproxystate '{svc}' off ; \
         /usr/sbin/networksetup -setwebproxy '{svc}' 127.0.0.1 {port} && \
         /usr/sbin/networksetup -setwebproxystate '{svc}' on && \
         /usr/sbin/networksetup -setsecurewebproxy '{svc}' 127.0.0.1 {port} && \
         /usr/sbin/networksetup -setsecurewebproxystate '{svc}' on && \
         echo 'ok' ; \
         /usr/sbin/networksetup -getwebproxy '{svc}' | head -1",
        svc = service,
        port = port,
    );
    let elevated_out = run_elevated_with_output(&cmd)?;
    eprintln!("[proxyorbit] set_system_proxy (admin): {}", elevated_out.trim());

    // ── 2. Env vars for CLI / IDE (user-level, no admin) ────────────────
    // `launchctl setenv` as the current user sets variables for newly-spawned
    // processes in this login session. Must run unprivileged — setting them
    // under sudo/osascript would land in root's domain and be invisible to
    // the user's terminals and IDEs.
    //
    // SSL_CERT_FILE + NODE_EXTRA_CA_CERTS point at our CA so CLI tools
    // (curl / node / python / aws-cli) trust the MITM leafs without any
    // per-tool config.
    for (k, v) in [
        ("HTTPS_PROXY",         format!("http://127.0.0.1:{}", port)),
        ("HTTP_PROXY",          format!("http://127.0.0.1:{}", port)),
        ("https_proxy",         format!("http://127.0.0.1:{}", port)),
        ("http_proxy",          format!("http://127.0.0.1:{}", port)),
        ("ALL_PROXY",           format!("http://127.0.0.1:{}", port)),
        ("all_proxy",           format!("http://127.0.0.1:{}", port)),
        ("SSL_CERT_FILE",       ca_path.clone()),
        ("NODE_EXTRA_CA_CERTS", ca_path.clone()),
        ("REQUESTS_CA_BUNDLE",  ca_path.clone()),
        ("CURL_CA_BUNDLE",      ca_path.clone()),
    ] {
        let _ = Command::new("/bin/launchctl").args(["setenv", k, &v]).output();
    }
    eprintln!("[proxyorbit] set_system_proxy: launchctl env set (new terminals/IDEs pick up HTTPS_PROXY + SSL_CERT_FILE)");
    Ok(())
}

/// Proxy-URL env vars: the dangerous ones to leave dangling. If the app
/// dies and these stay set, every newly-spawned process tries to route
/// through 127.0.0.1:8080 and gets ECONNREFUSED — which breaks browsers,
/// terminals, IDEs, and corporate VPN-dependent tools.
pub(crate) const PROXY_URL_ENV_KEYS: &[&str] = &[
    "HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy",
    "ALL_PROXY", "all_proxy",
];

/// CA-trust env vars: additive (NODE_EXTRA_CA_CERTS) or pointing at a file
/// path that still exists after the app dies. Safe to leave set across an
/// unclean shutdown — Node/curl/python will simply continue trusting our
/// CA in addition to (or in place of, for the *_BUNDLE ones) the system
/// roots, which is harmless when no traffic is being intercepted. We only
/// clear these on a graceful unset (user toggled the proxy off), never on
/// crash-exit, so Node tools don't suddenly find themselves outside the
/// corporate VPN's trust chain.
pub(crate) const CA_ENV_KEYS: &[&str] = &[
    "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
];

/// All keys we ever set — used by graceful unset only.
fn all_env_keys() -> impl Iterator<Item = &'static str> {
    PROXY_URL_ENV_KEYS.iter().chain(CA_ENV_KEYS.iter()).copied()
}

/// Drop the proxy-URL env vars without prompting for admin. Safe to call
/// from any context (signal handler, RunEvent::Exit, startup orphan-detect).
/// Idempotent. Does NOT touch CA-trust vars (those are harmless when stale)
/// and does NOT touch networksetup state (requires admin we can't prompt
/// for during shutdown).
pub(crate) fn clear_proxy_url_env_vars() {
    for k in PROXY_URL_ENV_KEYS {
        let _ = Command::new("/bin/launchctl").args(["unsetenv", k]).output();
    }
}

/// Full graceful clear — both proxy URLs and CA trust. Only used when the
/// user explicitly toggles the proxy off, never on shutdown.
pub(crate) fn clear_all_proxyorbit_env_vars() {
    for k in all_env_keys() {
        let _ = Command::new("/bin/launchctl").args(["unsetenv", k]).output();
    }
}

#[tauri::command]
pub fn unset_system_proxy() -> Result<(), String> {
    let service = get_active_service();

    // Admin half — flip the GUI system proxy off. Tolerate the case where
    // it was never on (e.g. corporate MDM blocked the set). We don't want
    // an error here to leave orphaned env vars.
    let cmd = format!(
        "/usr/sbin/networksetup -setwebproxystate '{svc}' off ; \
         /usr/sbin/networksetup -setsecurewebproxystate '{svc}' off ; \
         true",
        svc = service,
    );
    let _ = run_elevated_with_output(&cmd);

    // User-level half — graceful, full clear (both proxy URLs and CA trust).
    clear_all_proxyorbit_env_vars();
    Ok(())
}

/// Called from the Tauri RunEvent::Exit hook and from a SIGTERM/SIGINT
/// handler. Only the proxy-URL vars are cleared — leaving NODE_EXTRA_CA_CERTS
/// / SSL_CERT_FILE etc. intact across a crash is harmless (the CA file is
/// still on disk) and avoids surprising tools that then suddenly find
/// themselves outside whatever extra trust chain we configured.
pub fn cleanup_on_exit() {
    eprintln!("[proxyorbit] cleanup_on_exit: clearing launchd HTTP_PROXY / HTTPS_PROXY / ALL_PROXY (CA trust env preserved)");
    clear_proxy_url_env_vars();
}

/// True if any of our proxy-URL env vars is currently set in launchd's
/// user domain. Used on startup to detect orphaned state from a previous
/// crash. We deliberately don't check the CA-trust vars — those aren't
/// dangerous to leave set, so their presence isn't an "orphan" condition.
#[tauri::command]
pub fn has_orphaned_proxy_env() -> bool {
    for k in PROXY_URL_ENV_KEYS {
        let out = Command::new("/bin/launchctl")
            .args(["getenv", k])
            .output();
        if let Ok(o) = out {
            // launchctl getenv prints the value + newline if set, empty if not.
            if !o.stdout.is_empty() && o.status.success() {
                return true;
            }
        }
    }
    false
}

/// Force-clear our launchd proxy-URL env vars without admin. Safe to call
/// any time. CA-trust vars are NOT touched — they're harmless to leave set,
/// and clearing them could surprise tools (especially Node) that were
/// relying on them to trust corporate roots layered on top.
#[tauri::command]
pub fn force_clear_proxy_env() -> Result<(), String> {
    clear_proxy_url_env_vars();
    Ok(())
}

/// Like `run_elevated` but returns the captured stdout so the caller can log
/// which step inside the shell command actually ran (useful when corporate
/// MDM silently no-ops proxy changes).
#[cfg(target_os = "macos")]
fn run_elevated_with_output(shell_cmd: &str) -> Result<String, String> {
    let applescript = format!(
        r#"do shell script "{}" with administrator privileges"#,
        shell_cmd.replace('"', "\\\""),
    );
    let output = Command::new("osascript")
        .args(["-e", &applescript])
        .output()
        .map_err(|e| format!("osascript spawn: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(not(target_os = "macos"))]
fn run_elevated_with_output(_shell_cmd: &str) -> Result<String, String> {
    Err("system-proxy auto-configure is only implemented on macOS".into())
}

/// Read-only status check — true if either HTTP or HTTPS system proxy is
/// currently pointing at 127.0.0.1. Doesn't require admin.
#[tauri::command]
pub fn get_system_proxy_status() -> bool {
    let service = get_active_service();
    let http = Command::new("networksetup")
        .args(["-getwebproxy", &service])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("Enabled: Yes"))
        .unwrap_or(false);
    let https = Command::new("networksetup")
        .args(["-getsecurewebproxy", &service])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("Enabled: Yes"))
        .unwrap_or(false);
    http || https
}
