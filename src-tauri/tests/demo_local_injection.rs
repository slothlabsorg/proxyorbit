// Demo: prove ServeLocalFile serves the real on-disk build (with its marker)
// through the proxy instead of forwarding to the origin.
use std::sync::Arc;
use std::time::Duration;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Client, Request, Response, Server};
use proxyorbit_lib::commands::rewrite::{first_match, RewriteRule, RuleAction, RuleMatch};

async fn spawn_origin(body: &'static str) -> u16 {
    let svc = make_service_fn(move |_| async move {
        Ok::<_, hyper::Error>(service_fn(move |_r: Request<Body>| async move {
            Ok::<_, hyper::Error>(Response::new(Body::from(body)))
        }))
    });
    let server = Server::bind(&([127,0,0,1],0).into()).serve(svc);
    let port = server.local_addr().port();
    tokio::spawn(async move { let _ = server.await; });
    port
}

async fn start_proxy(rules: Vec<RewriteRule>) -> u16 {
    let rules = Arc::new(rules);
    let l = tokio::net::TcpListener::bind(("127.0.0.1",0)).await.unwrap();
    let port = l.local_addr().unwrap().port();
    let std_l = l.into_std().unwrap(); std_l.set_nonblocking(true).unwrap();
    let svc = make_service_fn(move |_| {
        let rules = Arc::clone(&rules);
        async move { Ok::<_, hyper::Error>(service_fn(move |req: Request<Body>| {
            let rules = Arc::clone(&rules);
            async move {
                let (m,u)=(req.method().to_string(), req.uri().clone());
                let url=u.to_string(); let host=u.host().unwrap_or("").to_string();
                let pq=u.path_and_query().map(|p|p.as_str()).unwrap_or("/").to_string();
                if let Some(r)=first_match(&rules,&m,&host,&url,&pq) {
                    if let RuleAction::ServeLocalFile{path,content_type}=&r.action {
                        if let Ok(bytes)=tokio::fs::read(path).await {
                            let ct=content_type.clone().unwrap_or("application/octet-stream".into());
                            return Ok::<_,hyper::Error>(Response::builder().status(200)
                                .header("content-type",ct).body(Body::from(bytes)).unwrap());
                        }
                    }
                }
                let c=Client::new();
                let f=Request::builder().method(m.as_str()).uri(&url).body(Body::empty()).unwrap();
                match c.request(f).await { Ok(r)=>Ok(r), Err(_)=>Ok(Response::builder().status(502).body(Body::empty()).unwrap()) }
            }
        })) }
    });
    tokio::spawn(async move { let _=Server::from_tcp(std_l).unwrap().serve(svc).await; });
    port
}

async fn through(port:u16, url:&str)->String {
    use tokio::io::{AsyncReadExt,AsyncWriteExt};
    let mut s=tokio::net::TcpStream::connect(("127.0.0.1",port)).await.unwrap();
    let host=url.trim_start_matches("http://").splitn(2,'/').next().unwrap().to_string();
    s.write_all(format!("GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",url,host).as_bytes()).await.unwrap();
    let mut b=Vec::new(); s.read_to_end(&mut b).await.unwrap();
    String::from_utf8_lossy(&b).splitn(2,"\r\n\r\n").nth(1).unwrap_or("").to_string()
}

#[tokio::test]
async fn serves_real_local_build_with_marker() {
    let plugin = format!("{}/dev/pexrtc-plugin/dist/aw-video-plugin-pexrtc.umd.js",
        std::env::var("HOME").unwrap());
    if !std::path::Path::new(&plugin).exists() {
        eprintln!("skip: local build not present at {}", plugin);
        return;
    }
    let origin = spawn_origin("CDN-ORIGINAL-BUNDLE").await;
    let url = format!("http://127.0.0.1:{}/pkg@1.0/dist/bundle.js", origin);
    let rules = vec![RewriteRule{
        id:"demo".into(), name:"inject".into(), enabled:true,
        match_: RuleMatch{ method:Some("GET".into()), host:"127.0.0.1".into(),
            path_contains:"bundle.js".into(), url_regex:None },
        action: RuleAction::ServeLocalFile{ path:plugin.clone(), content_type:Some("application/javascript".into()) },
    }];
    let port = start_proxy(rules).await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    let body = through(port,&url).await;
    assert!(body.contains("PROXYORBIT"), "expected injection marker in served build");
    assert!(!body.contains("CDN-ORIGINAL-BUNDLE"), "origin must NOT be served");
    eprintln!("✓ Served local build ({} bytes) with marker — origin bypassed", body.len());
}
