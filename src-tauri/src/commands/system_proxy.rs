use std::process::Command;

/// Detect the primary active network service name on macOS
fn get_active_service() -> String {
    // Try to get the default network service
    let output = Command::new("networksetup")
        .args(["-listnetworkserviceorder"])
        .output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout);
        // Look for Wi-Fi first, then Ethernet, then first service
        for preferred in &["Wi-Fi", "Ethernet", "USB 10/100/1000 LAN"] {
            if text.contains(preferred) {
                return preferred.to_string();
            }
        }
        // Return first service found
        for line in text.lines() {
            if line.starts_with('(') && !line.contains("*") {
                let trimmed = line.trim_start_matches(|c: char| c == '(' || c.is_ascii_digit()).trim_end_matches(')').trim();
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
    let host = "127.0.0.1";
    let port_str = port.to_string();

    // Set HTTP proxy
    Command::new("networksetup")
        .args(["-setwebproxy", &service, host, &port_str])
        .output()
        .map_err(|e| e.to_string())?;
    Command::new("networksetup")
        .args(["-setwebproxystate", &service, "on"])
        .output()
        .map_err(|e| e.to_string())?;

    // Set HTTPS proxy
    Command::new("networksetup")
        .args(["-setsecurewebproxy", &service, host, &port_str])
        .output()
        .map_err(|e| e.to_string())?;
    Command::new("networksetup")
        .args(["-setsecurewebproxystate", &service, "on"])
        .output()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn unset_system_proxy() -> Result<(), String> {
    let service = get_active_service();

    Command::new("networksetup")
        .args(["-setwebproxystate", &service, "off"])
        .output()
        .map_err(|e| e.to_string())?;

    Command::new("networksetup")
        .args(["-setsecurewebproxystate", &service, "off"])
        .output()
        .map_err(|e| e.to_string())?;

    Ok(())
}
