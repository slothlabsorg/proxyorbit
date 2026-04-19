use std::collections::VecDeque;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use hyper::server::conn::AddrStream;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Client, Request, Response, Server};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use uuid::Uuid;

const MAX_ENTRIES: usize = 10_000;

// ── Types ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyEntry {
    pub id: String,
    pub timestamp: u64,        // ms since epoch
    pub method: String,
    pub url: String,
    pub host: String,
    pub path: String,
    pub status: Option<u16>,
    pub duration_ms: Option<u64>,
    pub request_size: u64,
    pub response_size: u64,
    pub is_https: bool,
    pub protocol: String,
    pub process: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub running: bool,
    pub port: u16,
    pub request_count: usize,
    pub system_proxy_set: bool,
}

// ── Shared state ──────────────────────────────────────────────────────────────

pub struct ProxyState {
    pub entries: Arc<Mutex<VecDeque<ProxyEntry>>>,
    pub shutdown_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    pub running: Arc<Mutex<bool>>,
    pub port: Arc<Mutex<u16>>,
    pub system_proxy_set: Arc<Mutex<bool>>,
}

impl Default for ProxyState {
    fn default() -> Self {
        Self {
            entries: Arc::new(Mutex::new(VecDeque::new())),
            shutdown_tx: Arc::new(Mutex::new(None)),
            running: Arc::new(Mutex::new(false)),
            port: Arc::new(Mutex::new(8080)),
            system_proxy_set: Arc::new(Mutex::new(false)),
        }
    }
}

// ── Helper: current ms timestamp ──────────────────────────────────────────────

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
}

// ── HTTP proxy handler ────────────────────────────────────────────────────────

async fn handle_request(
    req: Request<Body>,
    app: AppHandle,
    entries: Arc<Mutex<VecDeque<ProxyEntry>>>,
) -> Result<Response<Body>, hyper::Error> {
    let method = req.method().to_string();
    let uri = req.uri().clone();
    let is_connect = method == "CONNECT";
    let ts = now_ms();

    if is_connect {
        // HTTPS CONNECT tunnel
        let host = uri.authority().map(|a| a.host().to_string()).unwrap_or_default();
        let path = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/").to_string();
        let req_size = 0u64;

        let entry = ProxyEntry {
            id: Uuid::new_v4().to_string(),
            timestamp: ts,
            method: "CONNECT".into(),
            url: format!("https://{}", host),
            host,
            path,
            status: Some(200),
            duration_ms: None,
            request_size: req_size,
            response_size: 0,
            is_https: true,
            protocol: "HTTPS".into(),
            process: None,
        };
        store_and_emit(entry, &entries, &app);

        // Return 200 Connection Established
        Ok(Response::new(Body::empty()))
    } else {
        // Plain HTTP request
        let url_str = if uri.scheme().is_some() {
            uri.to_string()
        } else {
            let host_header = req.headers()
                .get("host")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("unknown");
            format!("http://{}{}", host_header, uri.path_and_query().map(|p| p.as_str()).unwrap_or("/"))
        };

        let host = uri.host().or_else(|| {
            req.headers().get("host").and_then(|v| v.to_str().ok())
        }).unwrap_or("unknown").to_string();

        let path = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/").to_string();
        let req_size = 0u64;

        let start = Instant::now();
        let client = Client::new();

        // Build forwarded request
        let (parts, body) = req.into_parts();
        let forward_req = Request::from_parts(parts, body);

        let result = client.request(forward_req).await;
        let duration_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok(resp) => {
                let status = Some(resp.status().as_u16());
                let (resp_parts, resp_body) = resp.into_parts();
                let resp_bytes = hyper::body::to_bytes(resp_body).await.unwrap_or_default();
                let resp_size = resp_bytes.len() as u64;

                let entry = ProxyEntry {
                    id: Uuid::new_v4().to_string(),
                    timestamp: ts,
                    method,
                    url: url_str,
                    host,
                    path,
                    status,
                    duration_ms: Some(duration_ms),
                    request_size: req_size,
                    response_size: resp_size,
                    is_https: false,
                    protocol: "HTTP".into(),
                    process: None,
                };

                store_and_emit(entry, &entries, &app);

                Ok(Response::from_parts(resp_parts, Body::from(resp_bytes)))
            }
            Err(e) => {
                let entry = ProxyEntry {
                    id: Uuid::new_v4().to_string(),
                    timestamp: ts,
                    method,
                    url: url_str,
                    host,
                    path,
                    status: Some(502),
                    duration_ms: Some(duration_ms),
                    request_size: req_size,
                    response_size: 0,
                    is_https: false,
                    protocol: "HTTP".into(),
                    process: None,
                };
                store_and_emit(entry, &entries, &app);
                Err(e)
            }
        }
    }
}

fn store_and_emit(entry: ProxyEntry, entries: &Arc<Mutex<VecDeque<ProxyEntry>>>, app: &AppHandle) {
    let mut log = entries.lock().unwrap();
    if log.len() >= MAX_ENTRIES {
        log.pop_front();
    }
    log.push_back(entry.clone());
    drop(log);
    let _ = app.emit("proxy-request", &entry);
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_proxy(
    port: u16,
    app: AppHandle,
    state: tauri::State<'_, ProxyState>,
) -> Result<(), String> {
    let already = *state.running.lock().unwrap();
    if already {
        return Ok(());
    }

    let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().map_err(|e: std::net::AddrParseError| e.to_string())?;

    let entries = Arc::clone(&state.entries);
    let (tx, rx) = oneshot::channel::<()>();

    *state.shutdown_tx.lock().unwrap() = Some(tx);
    *state.running.lock().unwrap() = true;
    *state.port.lock().unwrap() = port;

    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        let entries_clone = Arc::clone(&entries);
        let make_svc = make_service_fn(move |_conn: &AddrStream| {
            let entries_inner = Arc::clone(&entries_clone);
            let app_inner = app_clone.clone();
            async move {
                Ok::<_, hyper::Error>(service_fn(move |req| {
                    handle_request(req, app_inner.clone(), Arc::clone(&entries_inner))
                }))
            }
        });

        let server = Server::bind(&addr)
            .serve(make_svc)
            .with_graceful_shutdown(async move {
                let _ = rx.await;
            });

        if let Err(e) = server.await {
            eprintln!("Proxy server error: {}", e);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_proxy(state: tauri::State<'_, ProxyState>) -> Result<(), String> {
    let tx = state.shutdown_tx.lock().unwrap().take();
    if let Some(tx) = tx {
        let _ = tx.send(());
    }
    *state.running.lock().unwrap() = false;
    Ok(())
}

#[tauri::command]
pub fn get_proxy_status(state: tauri::State<'_, ProxyState>) -> ProxyStatus {
    ProxyStatus {
        running: *state.running.lock().unwrap(),
        port: *state.port.lock().unwrap(),
        request_count: state.entries.lock().unwrap().len(),
        system_proxy_set: *state.system_proxy_set.lock().unwrap(),
    }
}

#[tauri::command]
pub fn list_entries(
    limit: Option<usize>,
    state: tauri::State<'_, ProxyState>,
) -> Vec<ProxyEntry> {
    let log = state.entries.lock().unwrap();
    let lim = limit.unwrap_or(1000);
    log.iter().rev().take(lim).cloned().collect::<Vec<_>>().into_iter().rev().collect()
}

#[tauri::command]
pub fn clear_entries(state: tauri::State<'_, ProxyState>) {
    state.entries.lock().unwrap().clear();
}

#[tauri::command]
pub fn delete_entry(id: String, state: tauri::State<'_, ProxyState>) {
    state.entries.lock().unwrap().retain(|e| e.id != id);
}
