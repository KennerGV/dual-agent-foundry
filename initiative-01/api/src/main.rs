use initiative_01_api::server::{handle_http_request, TelemetryServer, INITIAL_EVENTS};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8081".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let server = Arc::new(TelemetryServer::new());
    let events: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(
        INITIAL_EVENTS.iter().map(|s| s.to_string()).collect(),
    ));

    let listener = TcpListener::bind(&addr).expect("Failed to bind Telemetry Ingestor TCP port");
    println!("Initiative 01 Telemetry Ingestor API listening on http://{}", addr);

    for stream in listener.incoming().flatten() {
        let srv = Arc::clone(&server);
        let evts = Arc::clone(&events);
        std::thread::spawn(move || {
            let mut stream = stream;
            let mut buf = [0u8; 16384];
            let n = match stream.read(&mut buf) {
                Ok(n) if n > 0 => n,
                _ => return,
            };
            let req = String::from_utf8_lossy(&buf[..n]);
            let http_resp = handle_http_request(&srv, &evts, &req);
            let _ = stream.write_all(http_resp.as_bytes());
        });
    }
}
