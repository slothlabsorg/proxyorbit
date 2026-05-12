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

    // User-level half — drop launchd env vars. Idempotent.
    for k in [
        "HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy",
        "ALL_PROXY", "all_proxy",
        "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
    ] {
        let _ = Command::new("/bin/launchctl").args(["unsetenv", k]).output();
    }
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
