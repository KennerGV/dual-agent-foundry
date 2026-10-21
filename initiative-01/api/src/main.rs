use initiative_01_api::server::{IngestServer, TelemetryServer};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

const INITIAL_EVENTS: &[&str] = &[
    r#"{"event_id":"evt_9f8a7b6c","timestamp_utc":"2026-10-21T03:15:00Z","source_service":"payment-gateway-prod","host_id":"node-us-east-04","metrics":{"cpu_usage_pct":94.2,"memory_rss_mb":3840,"latency_p99_ms":1420.5,"error_rate_pct":18.4},"raw_log":"ERROR [conn_pool] timeout acquiring connection after 1000ms","compression":"lz4"}"#,
    r#"{"event_id":"evt_5e6f7g8h","timestamp_utc":"2026-10-21T03:14:30Z","source_service":"order-processor-prod","host_id":"node-us-west-02","metrics":{"cpu_usage_pct":78.5,"memory_rss_mb":2048,"latency_p99_ms":450.2,"error_rate_pct":2.1},"raw_log":"WARN [order_queue] queue depth exceeding soft threshold","compression":"lz4"}"#,
    r#"{"event_id":"evt_1a2b3c4d","timestamp_utc":"2026-10-21T03:14:00Z","source_service":"auth-service-prod","host_id":"node-us-east-01","metrics":{"cpu_usage_pct":45.0,"memory_rss_mb":1024,"latency_p99_ms":120.0,"error_rate_pct":0.1},"raw_log":"INFO [auth] token verified successfully","compression":"lz4"}"#,
];

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
            let first_line = req.lines().next().unwrap_or("");
            let parts: Vec<&str> = first_line.split_whitespace().collect();
            let (method, path) = match parts.as_slice() {
                [m, p, ..] => (*m, *p),
                _ => ("GET", "/"),
            };

            let body_str = req.split("\r\n\r\n").nth(1).unwrap_or("").trim();

            let (status_line, response_body) = if method == "GET" && path.starts_with("/healthz") {
                let h = srv.handle_health();
                (
                    "HTTP/1.1 200 OK",
                    format!(
                        r#"{{"status":"{}","service":"telemetry-ingestor","uptime_seconds":{}}}"#,
                        h.status, h.uptime_seconds
                    ),
                )
            } else if method == "GET" && path.starts_with("/v1/events") {
                let store = evts.lock().unwrap();
                let joined = store.join(",");
                ("HTTP/1.1 200 OK", format!("[{}]", joined))
            } else if method == "POST" && path.starts_with("/v1/ingest") {
                match srv.handle_ingest(body_str.as_bytes()) {
                    Ok(res) => {
                        if body_str.starts_with('{') && body_str.ends_with('}') {
                            let mut store = evts.lock().unwrap();
                            store.insert(0, body_str.to_string());
                            if store.len() > 50 {
                                store.truncate(50);
                            }
                        }
                        (
                            "HTTP/1.1 200 OK",
                            format!(
                                r#"{{"status":"{}","event_id":"{}"}}"#,
                                res.status, res.event_id
                            ),
                        )
                    }
                    Err(_) => (
                        "HTTP/1.1 400 Bad Request",
                        r#"{"error":"invalid telemetry payload"}"#.to_string(),
                    ),
                }
            } else {
                (
                    "HTTP/1.1 200 OK",
                    r#"{"service":"initiative-01-telemetry-ingestor","status":"ok"}"#.to_string(),
                )
            };

            let http_resp = format!(
                "{}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                status_line,
                response_body.len(),
                response_body
            );
            let _ = stream.write_all(http_resp.as_bytes());
        });
    }
}
