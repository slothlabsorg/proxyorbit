use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxySettings {
    pub port: u16,
    pub auto_start: bool,
    pub auto_set_system_proxy: bool,
    pub max_entries: usize,
    pub exclude_hosts: Vec<String>,
}

impl Default for ProxySettings {
    fn default() -> Self {
        Self {
            port: 8080,
            auto_start: true,
            auto_set_system_proxy: true,
            max_entries: 10_000,
            exclude_hosts: vec!["localhost".into(), "127.0.0.1".into()],
        }
    }
}

fn settings_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("proxyorbit").join("settings.json"))
}

#[tauri::command]
pub fn get_settings() -> ProxySettings {
    let path = match settings_path() {
        Some(p) => p,
        None => return ProxySettings::default(),
    };
    if !path.exists() {
        return ProxySettings::default();
    }
    let data = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

#[tauri::command]
pub fn save_settings(settings: ProxySettings) -> Result<(), String> {
    let path = settings_path().ok_or("Cannot determine config dir")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}
