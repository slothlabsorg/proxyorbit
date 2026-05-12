use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use hyper::server::conn::AddrStream;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Client, Request, Response, Server, StatusCode};
use hyper::client::HttpConnector;
use hyper_tls::HttpsConnector;
use hyper::upgrade::Upgraded;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Listener};
use tokio::net::TcpStream;
use tokio::sync::{oneshot, Notify};
use tokio_rustls::rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use tokio_rustls::rustls::ServerConfig;
use tokio_rustls::TlsAcceptor;
use uuid::Uuid;

use crate::ca::Ca;

/// Hard cap on in-memory request log — prevents unbounded growth during long
/// capture sessions. When full, oldest entries are evicted first.
const MAX_ENTRIES: usize = 10_000;
/// Hard cap on captured body size per request. 1 MiB. Keeps memory bounded
/// on large downloads and gigantic response payloads.
const MAX_BODY_BYTES: usize = 1024 * 1024;
/// Max time we'll hold a request pending user interception before forwarding
/// anyway. Prevents the UI from being able to lock up remote traffic forever.
const INTERCEPT_TIMEOUT_SECS: u64 = 60;

// ── Types ──────────────────────────────────────────────────────────────────────

/// Headers serialised as a `Vec<(name, value)>` (not `HashMap`) because
/// HTTP allows duplicate names (e.g. multiple Set-Cookie) and order
/// matters for reproducing the exact request via cURL / replay.
pub type HeaderList = Vec<(String, String)>;

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

    // Full captured content. For CONNECT / HTTPS tunnels these stay empty
    // because the body is encrypted end-to-end (MITM with a trusted CA is
    // planned for a later version).
    pub request_headers: HeaderList,
    pub response_headers: HeaderList,
    /// Request body as UTF-8 string if the bytes are valid UTF-8, else
    /// a hex representation prefixed with `"<binary:...>"`. Capped at
    /// `MAX_BODY_BYTES`.
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    /// Set when the body was truncated because it exceeded `MAX_BODY_BYTES`.
    pub request_body_truncated: bool,
    pub response_body_truncated: bool,
    /// Entry kind — distinguishes a normal HTTP exchange from a CONNECT
    /// tunnel (HTTPS, bytes forwarded raw) from a WebSocket upgrade (future).
    pub kind: EntryKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Http,
    Connect,
    Websocket,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub running: bool,
    pub port: u16,
    pub request_count: usize,
    pub system_proxy_set: bool,
    pub intercepting: bool,
    pub mitm_enabled: bool,
}

// ── Intercept ─────────────────────────────────────────────────────────────────
//
// When `intercepting` is true, every outgoing HTTP request is paused and an
// `intercept-request` event is emitted to the frontend. The frontend can
// edit URL / headers / body and call the `release_intercept` command with
// the final payload. We await a per-request Notify which resolves when the
// frontend responds (or after a timeout, to avoid hanging the network).

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterceptPayload {
    pub id: String,
    pub method: String,
    pub url: String,
    pub headers: HeaderList,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterceptDecision {
    pub id: String,
    /// "forward" (send modified), "drop" (return 444), or "forward" with
    /// unchanged payload if the user just clicked continue.
    pub action: String,
    pub method: Option<String>,
    pub url: Option<String>,
    pub headers: Option<HeaderList>,
    pub body: Option<String>,
}

struct PendingIntercept {
    notify: Arc<Notify>,
    decision: Arc<Mutex<Option<InterceptDecision>>>,
}

// ── Shared state ──────────────────────────────────────────────────────────────

pub struct ProxyState {
    pub entries: Arc<Mutex<VecDeque<ProxyEntry>>>,
    pub shutdown_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    pub running: Arc<Mutex<bool>>,
    pub port: Arc<Mutex<u16>>,
    pub system_proxy_set: Arc<Mutex<bool>>,
    pub intercepting: Arc<Mutex<bool>>,
    pending_intercepts: Arc<Mutex<HashMap<String, PendingIntercept>>>,
    /// MITM HTTPS inspection toggle. Off by default until the user
    /// confirms they've installed the CA cert in their trust store.
    pub mitm_enabled: Arc<Mutex<bool>>,
    /// Lazily-loaded CA. Populated on `start_proxy` only if the CA can
    /// be read from / written to `~/.proxyorbit/ca/`. Stays `None` if
    /// loading failed (the proxy still works as a plain HTTP/blind-HTTPS
    /// logger in that case).
    pub ca: Arc<Mutex<Option<Arc<Ca>>>>,
    pub mitm_bypass_hosts: Arc<Mutex<Vec<String>>>,
}

impl Default for ProxyState {
    fn default() -> Self {
        Self {
            entries: Arc::new(Mutex::new(VecDeque::new())),
            shutdown_tx: Arc::new(Mutex::new(None)),
            running: Arc::new(Mutex::new(false)),
            port: Arc::new(Mutex::new(8080)),
            system_proxy_set: Arc::new(Mutex::new(false)),
            intercepting: Arc::new(Mutex::new(false)),
            pending_intercepts: Arc::new(Mutex::new(HashMap::new())),
            mitm_enabled: Arc::new(Mutex::new(false)),
            ca: Arc::new(Mutex::new(None)),
            mitm_bypass_hosts: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
}

fn headers_to_list(h: &hyper::HeaderMap) -> HeaderList {
    h.iter()
        .map(|(k, v)| {
            (k.as_str().to_string(), v.to_str().unwrap_or("<non-ascii>").to_string())
        })
        .collect()
}

fn list_to_headers(list: &HeaderList) -> hyper::HeaderMap {
    use hyper::header::{HeaderName, HeaderValue};
    let mut out = hyper::HeaderMap::new();
    for (k, v) in list {
        if let (Ok(name), Ok(val)) = (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v)) {
            out.append(name, val);
        }
    }
    out
}

/// Convert captured bytes to a displayable string. Keeps binary safe by
/// falling back to a short hex peek with a marker. Never panics on invalid
/// UTF-8 and never allocates more than 2× the input.
fn bytes_to_display(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => {
            let peek: String = bytes.iter().take(64).map(|b| format!("{:02x}", b)).collect();
            format!("<binary:{} bytes, first 64 hex: {}>", bytes.len(), peek)
        }
    }
}

// ── HTTPS CONNECT tunnel / MITM ──────────────────────────────────────────────
//
// There are two modes for CONNECT:
//
// 1. **Blind tunnel** (mitm disabled): splice bytes both directions between
//    client and origin. We see only the fact that a connection happened.
//    This is what Charles / Proxyman do for hosts the user has excluded
//    from inspection.
//
// 2. **MITM** (mitm enabled): we terminate TLS on the client side with a
//    leaf cert minted for the target host by our local CA, decrypt the
//    HTTP/1.1 stream, log + optionally intercept each request, then forward
//    to the real server over a fresh TLS connection. The user has to
//    install our CA cert for this to work — the UI in Settings guides
//    through that.

async fn tunnel(upgraded: Upgraded, target: String) -> std::io::Result<()> {
    let mut server = TcpStream::connect(&target).await?;
    let mut upgraded = upgraded;
    // `tokio::io::copy_bidirectional` handles both directions and terminates
    // when either side EOFs — simpler than split + join and safer w.r.t.
    // half-open connections.
    let _ = tokio::io::copy_bidirectional(&mut upgraded, &mut server).await;
    Ok(())
}

/// Build a rustls `ServerConfig` that presents the given leaf cert + key.
/// We disable client auth and stick with rustls defaults for cipher suites
/// and versions — matches what Chrome / Firefox accept.
fn build_tls_server_config(cert_der: Vec<u8>, key_der: Vec<u8>) -> anyhow::Result<ServerConfig> {
    let cert = CertificateDer::from(cert_der);
    let key = PrivateKeyDer::from(PrivatePkcs8KeyDer::from(key_der));
    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert], key)
        .map_err(|e| anyhow::anyhow!("rustls server config: {}", e))?;
    Ok(config)
}

/// Boxed alias with an explicit return type so recursive calls
/// (`handle_request` → `mitm_tunnel` → closure → `handle_request`) don't
/// blow up the opaque-type cycle checker.
type HandleFuture = std::pin::Pin<Box<dyn std::future::Future<Output = Result<Response<Body>, hyper::Error>> + Send>>;

fn handle_request_boxed(
    req: Request<Body>,
    app: AppHandle,
    state: Arc<StateForProxy>,
    mitm: Option<Arc<MitmContext>>,
) -> HandleFuture {
    Box::pin(handle_request(req, app, state, mitm))
}

/// MITM a CONNECT request: accept TLS with a minted leaf, then serve HTTP/1.1
/// on the decrypted stream — handing each request back to `handle_request`
/// with a MitmContext so it builds correct `https://{host}/...` URLs.
async fn mitm_tunnel(
    upgraded: Upgraded,
    host: String,
    app: AppHandle,
    state: Arc<StateForProxy>,
) -> anyhow::Result<()> {
    eprintln!("[proxyorbit] mitm start for {}", host);
    let Some(ca) = state.ca.as_ref().cloned() else {
        return Err(anyhow::anyhow!("MITM enabled but CA not loaded"));
    };
    let leaf = ca.leaf_for_host(&host)?;
    let tls_config = build_tls_server_config(leaf.cert_der, leaf.key_der)?;
    let acceptor = TlsAcceptor::from(Arc::new(tls_config));
    let tls_stream = acceptor.accept(upgraded).await
        .map_err(|e| anyhow::anyhow!("tls accept: {}", e))?;
    eprintln!("[proxyorbit] mitm tls handshake OK for {}", host);

    let ctx = Arc::new(MitmContext { host: host.clone() });
    let state_cl = Arc::clone(&state);
    let app_cl = app.clone();
    // `Box::pin` the recursive future call to break the type-inference
    // cycle: `handle_request` → `mitm_tunnel` → closure → `handle_request`
    // otherwise produces an "opaque type cycle" compile error.
    let svc = service_fn(move |req: Request<Body>| {
        handle_request_boxed(req, app_cl.clone(), Arc::clone(&state_cl), Some(Arc::clone(&ctx)))
    });

    hyper::server::conn::Http::new()
        .serve_connection(tls_stream, svc)
        .with_upgrades()
        .await
        .map_err(|e| anyhow::anyhow!("serve tls conn: {}", e))?;
    Ok(())
}

/// Context carried when we're handling a request pulled from a MITM'd
/// TLS stream — lets `handle_request` tag the entry as HTTPS and build
/// absolute URLs that include the real target host.
struct MitmContext {
    host: String,
}

// ── HTTP proxy handler ────────────────────────────────────────────────────────

async fn handle_request(
    req: Request<Body>,
    app: AppHandle,
    state: Arc<StateForProxy>,
    mitm: Option<Arc<MitmContext>>,
) -> Result<Response<Body>, hyper::Error> {
    let method = req.method().to_string();
    let uri = req.uri().clone();
    let is_connect = method == "CONNECT" && mitm.is_none();
    let ts = now_ms();

    eprintln!(
        "[proxyorbit] {} {} {}",
        if mitm.is_some() { "mitm" } else { "direct" },
        method,
        uri,
    );

    if is_connect {
        // ── CONNECT — either MITM-decrypt or blind-tunnel ─────────────────
        let authority = uri.authority().map(|a| a.to_string()).unwrap_or_default();
        let host = uri.authority().map(|a| a.host().to_string()).unwrap_or_default();
        let entry_id = Uuid::new_v4().to_string();
        let mitm_enabled = *state.mitm_enabled.lock().unwrap() && state.ca.is_some();
        let should_mitm = mitm_enabled && !should_bypass_mitm(&host, &state);

        let entry = ProxyEntry {
            id: entry_id.clone(),
            timestamp: ts,
            method: "CONNECT".into(),
            url: format!("https://{}", host),
            host: host.clone(),
            path: "/".into(),
            status: Some(200),
            duration_ms: None,
            request_size: 0,
            response_size: 0,
            is_https: true,
            protocol: if should_mitm { "HTTPS (MITM)".into() } else { "HTTPS".into() },
            process: None,
            request_headers: headers_to_list(req.headers()),
            response_headers: vec![],
            request_body: None,
            response_body: None,
            request_body_truncated: false,
            response_body_truncated: false,
            kind: EntryKind::Connect,
        };
        store_and_emit(entry, &state.entries, &app);

        let app_cl = app.clone();
        let state_cl = Arc::clone(&state);
        tokio::task::spawn(async move {
            match hyper::upgrade::on(req).await {
                Ok(upgraded) => {
                    if should_mitm {
                        if let Err(e) = mitm_tunnel(upgraded, host.clone(), app_cl, state_cl).await {
                            eprintln!("mitm tunnel {}: {}", host, e);
                        }
                    } else if let Err(e) = tunnel(upgraded, authority).await {
                        eprintln!("tunnel {}: {}", host, e);
                    }
                }
                Err(e) => eprintln!("upgrade error: {}", e),
            }
        });

        return Ok(Response::new(Body::empty()));
    }

    // ── Plain HTTP or MITM'd decrypted HTTP/1.1 ──────────────────────────
    let (url_str, host) = if let Some(ctx) = mitm.as_ref() {
        // Requests arriving on an MITM'd TLS stream have relative URIs
        // (e.g. `GET /repos/x HTTP/1.1`). Reconstruct the absolute URL.
        let path_q = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/");
        (format!("https://{}{}", ctx.host, path_q), ctx.host.clone())
    } else if uri.scheme().is_some() {
        let h = uri.host().map(|s| s.to_string()).unwrap_or_else(|| "unknown".into());
        (uri.to_string(), h)
    } else {
        let host_header = req
            .headers()
            .get("host")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("unknown")
            .to_string();
        let path_q = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/");
        (format!("http://{}{}", host_header, path_q), host_header)
    };

    let path = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/").to_string();
    let req_headers_list = headers_to_list(req.headers());

    // Buffer the request body so we can log it AND forward it.
    let (parts, body) = req.into_parts();
    let req_bytes = hyper::body::to_bytes(body).await.unwrap_or_default();
    let req_size = req_bytes.len() as u64;
    let (req_body_str, req_truncated) = capture_body(&req_bytes);

    // Intercept gate — if enabled, ask the frontend what to do.
    let mut final_method = method.clone();
    let mut final_url = url_str.clone();
    let mut final_headers = req_headers_list.clone();
    let mut final_body = req_bytes.to_vec();
    let mut was_intercepted = false;

    if *state.intercepting.lock().unwrap() {
        was_intercepted = true;
        let intercept_id = Uuid::new_v4().to_string();
        let payload = InterceptPayload {
            id: intercept_id.clone(),
            method: final_method.clone(),
            url: final_url.clone(),
            headers: final_headers.clone(),
            body: req_body_str.clone(),
        };
        let notify = Arc::new(Notify::new());
        let decision = Arc::new(Mutex::new(None));
        state.pending_intercepts.lock().unwrap().insert(
            intercept_id.clone(),
            PendingIntercept { notify: notify.clone(), decision: decision.clone() },
        );

        let _ = app.emit("intercept-request", &payload);

        // Wait for decision or timeout.
        let waited = tokio::time::timeout(
            Duration::from_secs(INTERCEPT_TIMEOUT_SECS),
            notify.notified(),
        )
        .await;

        state.pending_intercepts.lock().unwrap().remove(&intercept_id);

        if waited.is_ok() {
            if let Some(dec) = decision.lock().unwrap().clone() {
                if dec.action == "drop" {
                    // Log the dropped entry and short-circuit.
                    let entry = ProxyEntry {
                        id: Uuid::new_v4().to_string(),
                        timestamp: ts,
                        method: final_method,
                        url: final_url,
                        host: host.clone(),
                        path,
                        status: Some(444),
                        duration_ms: Some(0),
                        request_size: req_size,
                        response_size: 0,
                        is_https: false,
                        protocol: "HTTP".into(),
                        process: None,
                        request_headers: final_headers,
                        response_headers: vec![("x-proxyorbit".into(), "dropped-by-interceptor".into())],
                        request_body: req_body_str,
                        response_body: None,
                        request_body_truncated: req_truncated,
                        response_body_truncated: false,
                        kind: EntryKind::Http,
                    };
                    store_and_emit(entry, &state.entries, &app);
                    return Ok(Response::builder()
                        .status(StatusCode::from_u16(444).unwrap_or(StatusCode::BAD_REQUEST))
                        .body(Body::from("Dropped by ProxyOrbit interceptor"))
                        .unwrap_or_else(|_| Response::new(Body::empty())));
                }
                if let Some(m) = dec.method { final_method = m; }
                if let Some(u) = dec.url    { final_url = u; }
                if let Some(h) = dec.headers { final_headers = h; }
                if let Some(b) = dec.body   { final_body = b.into_bytes(); }
            }
        }
    }

    // ── Forward the (possibly modified) request ──────────────────────────
    let start = Instant::now();
    let https = HttpsConnector::new();
    let client: Client<HttpsConnector<HttpConnector>> = Client::builder().build(https);

    let mut builder = Request::builder().method(final_method.as_str()).uri(&final_url);
    if let Some(hm) = builder.headers_mut() {
        *hm = list_to_headers(&final_headers);
    }
    let Ok(forward_req) = builder.body(Body::from(final_body.clone())) else {
        return Ok(Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .body(Body::from("proxyorbit: failed to build forwarded request"))
            .unwrap());
    };
    let _ = parts; // acknowledge we intentionally dropped the original parts

    match client.request(forward_req).await {
        Ok(resp) => {
            let status = Some(resp.status().as_u16());
            let resp_headers_list = headers_to_list(resp.headers());
            let (resp_parts, resp_body) = resp.into_parts();
            let resp_bytes = hyper::body::to_bytes(resp_body).await.unwrap_or_default();
            let resp_size = resp_bytes.len() as u64;
            let (resp_body_str, resp_truncated) = capture_body(&resp_bytes);

            let entry = ProxyEntry {
                id: Uuid::new_v4().to_string(),
                timestamp: ts,
                method: if was_intercepted { final_method.clone() } else { method },
                url: if was_intercepted { final_url.clone() } else { url_str },
                host,
                path,
                status,
                duration_ms: Some(start.elapsed().as_millis() as u64),
                request_size: final_body.len() as u64,
                response_size: resp_size,
                is_https: final_url.starts_with("https://"),
                protocol: if final_url.starts_with("https://") { "HTTPS".into() } else { "HTTP".into() },
                process: None,
                request_headers: final_headers,
                response_headers: resp_headers_list,
                request_body: Some(bytes_to_display(&final_body)),
                response_body: resp_body_str,
                request_body_truncated: final_body.len() > MAX_BODY_BYTES,
                response_body_truncated: resp_truncated,
                kind: EntryKind::Http,
            };
            store_and_emit(entry, &state.entries, &app);
            Ok(Response::from_parts(resp_parts, Body::from(resp_bytes)))
        }
        Err(e) => {
            let entry = ProxyEntry {
                id: Uuid::new_v4().to_string(),
                timestamp: ts,
                method: if was_intercepted { final_method.clone() } else { method },
                url: if was_intercepted { final_url.clone() } else { url_str },
                host,
                path,
                status: Some(502),
                duration_ms: Some(start.elapsed().as_millis() as u64),
                request_size: final_body.len() as u64,
                response_size: 0,
                is_https: false,
                protocol: "HTTP".into(),
                process: None,
                request_headers: final_headers,
                response_headers: vec![("x-proxyorbit-error".into(), e.to_string())],
                request_body: req_body_str,
                response_body: None,
                request_body_truncated: req_truncated,
                response_body_truncated: false,
                kind: EntryKind::Http,
            };
            store_and_emit(entry, &state.entries, &app);
            Err(e)
        }
    }
}

fn capture_body(bytes: &[u8]) -> (Option<String>, bool) {
    if bytes.is_empty() {
        return (None, false);
    }
    if bytes.len() > MAX_BODY_BYTES {
        let slice = &bytes[..MAX_BODY_BYTES];
        return (Some(bytes_to_display(slice)), true);
    }
    (Some(bytes_to_display(bytes)), false)
}

fn store_and_emit(entry: ProxyEntry, entries: &Arc<Mutex<VecDeque<ProxyEntry>>>, app: &AppHandle) {
    let mut log = entries.lock().unwrap();
    if log.len() >= MAX_ENTRIES {
        log.pop_front();
    }
    log.push_back(entry.clone());
    let count = log.len();
    drop(log);
    match app.emit("proxy-request", &entry) {
        Ok(_) => eprintln!("[proxyorbit] stored+emitted {} {} (total={})", entry.method, entry.url, count),
        Err(e) => eprintln!("[proxyorbit] emit failed: {}", e),
    }
}

/// Snapshot of the ProxyState pieces the async handler needs, so we can
/// `Arc::clone` into the hyper service_fn closure without passing the whole
/// Tauri `State<'_, _>` (which isn't `'static`).
struct StateForProxy {
    entries: Arc<Mutex<VecDeque<ProxyEntry>>>,
    intercepting: Arc<Mutex<bool>>,
    pending_intercepts: Arc<Mutex<HashMap<String, PendingIntercept>>>,
    mitm_enabled: Arc<Mutex<bool>>,
    /// Optional — when HTTPS MITM is enabled at startup the CA is loaded
    /// and stored here so every subsequent CONNECT can mint a leaf.
    ca: Option<Arc<Ca>>,
    /// Hosts the user has opted out of MITM for. Useful for sites with
    /// strict certificate pinning (banking apps, some mobile SDKs) that
    /// would break under our substituted cert.
    mitm_bypass_hosts: Arc<Mutex<Vec<String>>>,
}

/// Match a host against the user's opt-out list. Simple suffix match so
/// `apple.com` bypasses `*.apple.com` too.
fn should_bypass_mitm(host: &str, state: &StateForProxy) -> bool {
    let guard = state.mitm_bypass_hosts.lock().unwrap();
    guard.iter().any(|pat| host == pat || host.ends_with(&format!(".{}", pat)))
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

    let addr: SocketAddr = format!("127.0.0.1:{}", port)
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;

    // Bind synchronously so we surface port-in-use / permission errors to the
    // UI instead of silently failing inside the spawned task and leaving
    // `running: true` lying.
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("bind {}: {}", addr, e))?;
    let std_listener = listener.into_std().map_err(|e| e.to_string())?;
    std_listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    eprintln!("[proxyorbit] listening on {}", addr);

    // Ensure a CA exists. If MITM is off this is still cheap — just load
    // or generate the on-disk root. We only ever mint leafs when MITM is
    // actually toggled on AND a CONNECT comes in.
    if state.ca.lock().unwrap().is_none() {
        match Ca::load_or_generate() {
            Ok(ca) => *state.ca.lock().unwrap() = Some(Arc::new(ca)),
            Err(e) => eprintln!("CA init failed (HTTPS MITM disabled): {}", e),
        }
    }

    let ca_snapshot = state.ca.lock().unwrap().clone();
    let snapshot = Arc::new(StateForProxy {
        entries: Arc::clone(&state.entries),
        intercepting: Arc::clone(&state.intercepting),
        pending_intercepts: Arc::clone(&state.pending_intercepts),
        mitm_enabled: Arc::clone(&state.mitm_enabled),
        ca: ca_snapshot,
        mitm_bypass_hosts: Arc::clone(&state.mitm_bypass_hosts),
    });
    let (tx, rx) = oneshot::channel::<()>();

    *state.shutdown_tx.lock().unwrap() = Some(tx);
    *state.running.lock().unwrap() = true;
    *state.port.lock().unwrap() = port;

    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        let make_svc = make_service_fn(move |_conn: &AddrStream| {
            let snap_inner = Arc::clone(&snapshot);
            let app_inner = app_clone.clone();
            async move {
                Ok::<_, hyper::Error>(service_fn(move |req| {
                    handle_request(req, app_inner.clone(), Arc::clone(&snap_inner), None)
                }))
            }
        });

        let server = Server::from_tcp(std_listener)
            .expect("from_tcp on pre-bound listener")
            .http1_preserve_header_case(true)
            .http1_title_case_headers(true)
            .serve(make_svc)
            .with_graceful_shutdown(async move {
                let _ = rx.await;
            });

        if let Err(e) = server.await {
            eprintln!("[proxyorbit] server exited: {}", e);
        }
    });

    // Listen for intercept-release events so the async proxy handler can
    // wake up and forward/drop the paused request.
    let pending = Arc::clone(&state.pending_intercepts);
    app.listen("intercept-release", move |event| {
        let payload: Result<InterceptDecision, _> = serde_json::from_str(event.payload());
        if let Ok(dec) = payload {
            let guard = pending.lock().unwrap();
            if let Some(p) = guard.get(&dec.id) {
                *p.decision.lock().unwrap() = Some(dec.clone());
                p.notify.notify_one();
            }
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
        intercepting: *state.intercepting.lock().unwrap(),
        mitm_enabled: *state.mitm_enabled.lock().unwrap(),
    }
}

/// Toggle HTTPS MITM. On first enable we make sure the CA is on disk so the
/// UI can show the install instructions. Off means CONNECT falls back to
/// blind tunnel (which still works for all hosts, just no inspection).
#[tauri::command]
pub fn set_mitm_enabled(enabled: bool, state: tauri::State<'_, ProxyState>) -> Result<(), String> {
    if enabled && state.ca.lock().unwrap().is_none() {
        match Ca::load_or_generate() {
            Ok(ca) => *state.ca.lock().unwrap() = Some(Arc::new(ca)),
            Err(e) => return Err(format!("CA init failed: {}", e)),
        }
    }
    *state.mitm_enabled.lock().unwrap() = enabled;
    Ok(())
}

/// Return the CA public cert as PEM — used by the Settings UI to show the
/// user what to install. Callers can also read the file at `get_ca_pem_path`
/// directly.
#[tauri::command]
pub fn get_ca_pem(state: tauri::State<'_, ProxyState>) -> Result<String, String> {
    if state.ca.lock().unwrap().is_none() {
        match Ca::load_or_generate() {
            Ok(ca) => *state.ca.lock().unwrap() = Some(Arc::new(ca)),
            Err(e) => return Err(format!("CA init failed: {}", e)),
        }
    }
    let guard = state.ca.lock().unwrap();
    Ok(guard.as_ref().unwrap().cert_pem.clone())
}

/// Path on disk to `ca.pem`. Useful for users who want to `security add-trusted-cert`
/// or just drag it into Keychain Access.
#[tauri::command]
pub fn get_ca_pem_path() -> Result<String, String> {
    crate::ca::ca_pem_path()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Opt a host out of MITM. Used for sites with strict cert pinning.
#[tauri::command]
pub fn set_mitm_bypass_hosts(hosts: Vec<String>, state: tauri::State<'_, ProxyState>) {
    *state.mitm_bypass_hosts.lock().unwrap() = hosts;
}

#[tauri::command]
pub fn set_intercepting(enabled: bool, state: tauri::State<'_, ProxyState>) {
    *state.intercepting.lock().unwrap() = enabled;
    if !enabled {
        // Release any pending intercepts — otherwise turning intercept off
        // with queued requests would leave them hanging until the 60 s timeout.
        let pending = state.pending_intercepts.lock().unwrap();
        for (_, p) in pending.iter() {
            *p.decision.lock().unwrap() = Some(InterceptDecision {
                id: String::new(),
                action: "forward".into(),
                method: None, url: None, headers: None, body: None,
            });
            p.notify.notify_one();
        }
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

// ── Replay ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ReplayResult {
    pub status: Option<u16>,
    pub duration_ms: u64,
    pub response_headers: HeaderList,
    pub response_body: Option<String>,
    pub response_body_truncated: bool,
    pub error: Option<String>,
}

/// Re-send an HTTP request captured in the log, optionally with the
/// frontend supplying modified method / url / headers / body. The replayed
/// request bypasses the proxy log entirely (we don't want replays to
/// pollute capture history — that would be confusing) and returns the
/// response directly to the caller.
#[tauri::command]
pub async fn replay_request(
    method: String,
    url: String,
    headers: HeaderList,
    body: Option<String>,
) -> Result<ReplayResult, String> {
    let https = HttpsConnector::new();
    let client: Client<HttpsConnector<HttpConnector>> = Client::builder().build(https);

    let mut builder = Request::builder().method(method.as_str()).uri(&url);
    if let Some(hm) = builder.headers_mut() {
        *hm = list_to_headers(&headers);
    }
    let body_bytes = body.unwrap_or_default().into_bytes();
    let req = builder
        .body(Body::from(body_bytes))
        .map_err(|e| e.to_string())?;

    let start = Instant::now();
    match client.request(req).await {
        Ok(resp) => {
            let status = Some(resp.status().as_u16());
            let resp_headers = headers_to_list(resp.headers());
            let bytes = hyper::body::to_bytes(resp.into_body())
                .await
                .map_err(|e| e.to_string())?;
            let (body_str, truncated) = capture_body(&bytes);
            Ok(ReplayResult {
                status,
                duration_ms: start.elapsed().as_millis() as u64,
                response_headers: resp_headers,
                response_body: body_str,
                response_body_truncated: truncated,
                error: None,
            })
        }
        Err(e) => Ok(ReplayResult {
            status: None,
            duration_ms: start.elapsed().as_millis() as u64,
            response_headers: vec![],
            response_body: None,
            response_body_truncated: false,
            error: Some(e.to_string()),
        }),
    }
}
