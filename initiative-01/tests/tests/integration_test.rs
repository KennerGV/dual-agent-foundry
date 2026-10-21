use initiative_01_api::*;
use initiative_01_core::*;
use initiative_01_storage::*;
use initiative_01_tests::*;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

#[test]
fn test_harness_status() {
    assert!(integration_harness_ready());
}

#[test]
fn test_end_to_end_telemetry_pipeline_success() {
    let payload = sample_telemetry_json();

    // 1. Ingest via API
    let server = TelemetryServer::new();
    let resp = server.handle_ingest(payload).expect("Ingest should succeed");
    assert_eq!(resp.status, "ok");
    assert_eq!(resp.event_id, "evt_9f8a7b6c");

    // 2. Parse payload with Core parser
    let parser = JsonEventParser::new();
    let event = parser.parse(payload).expect("Parsing should succeed");
    assert_eq!(event.event_id, "evt_9f8a7b6c");
    assert_eq!(event.source_service, "payment-gateway-prod");
    assert_eq!(event.metrics.cpu_usage_pct, 94.2);

    // 3. Validate event with Core validator
    let validator = DefaultEventValidator::new();
    assert!(validator.validate(&event).is_ok());

    // 4. Compress raw log using Storage LZ4 compressor
    let compressor = Lz4Compressor::new();
    let compressed_log = compressor
        .compress(event.raw_log.as_bytes())
        .expect("Compression should succeed");

    // 5. Write compressed log to Storage Circular WAL
    let mut wal = RingBufferWal::new(1024);
    let offset = wal
        .append(&compressed_log)
        .expect("WAL append should succeed");
    assert_eq!(offset, 0);

    // 6. Read back compressed payload from WAL
    let wal_data = wal
        .read_offset(offset, compressed_log.len())
        .expect("WAL read should succeed");
    assert_eq!(wal_data, compressed_log);

    // 7. Decompress log and compare with original
    let decompressed_bytes = compressor
        .decompress(&wal_data)
        .expect("Decompression should succeed");
    let decompressed_str = std::str::from_utf8(&decompressed_bytes).expect("Valid UTF-8 log");
    assert_eq!(decompressed_str, event.raw_log);
}

#[test]
fn test_pipeline_helper_function() {
    let payload = sample_telemetry_json();
    let (offset, decompressed) =
        run_full_pipeline(payload, 512).expect("Pipeline helper should complete successfully");
    assert_eq!(offset, 0);

    let parser = JsonEventParser::new();
    let event = parser.parse(payload).unwrap();
    assert_eq!(decompressed, event.raw_log.as_bytes());
}

#[test]
fn test_api_server_ingest_and_health_flow() {
    let server = TelemetryServer::new();

    // Health check
    let health = server.handle_health();
    assert_eq!(health.status, "ok");

    // Valid ingest
    let payload = sample_telemetry_json();
    let res = server.handle_ingest(payload).expect("Ingest valid payload");
    assert_eq!(res.status, "ok");
    assert_eq!(res.event_id, "evt_9f8a7b6c");
}

#[test]
fn test_api_server_error_handling() {
    let server = TelemetryServer::new();

    // Empty payload
    let empty_res = server.handle_ingest(&[]);
    assert_eq!(
        empty_res,
        Err(ApiError::InvalidPayload("Payload cannot be empty".into()))
    );

    // Invalid UTF-8 payload
    let invalid_utf8 = vec![0x80, 0x81, 0xFF];
    let utf8_res = server.handle_ingest(&invalid_utf8);
    assert!(matches!(utf8_res, Err(ApiError::InvalidPayload(_))));
}

#[test]
fn test_core_validation_edge_cases() {
    let validator = DefaultEventValidator::new();

    let invalid_cpu_event = TelemetryEvent {
        event_id: "evt_invalid_cpu",
        timestamp_utc: "2026-10-20T18:00:00Z",
        source_service: "auth-service",
        host_id: "node-1",
        metrics: Metrics {
            cpu_usage_pct: 105.0, // Invalid: > 100%
            memory_rss_mb: 2048.0,
            latency_p99_ms: 50.0,
            error_rate_pct: 0.0,
        },
        raw_log: "info",
        compression: "lz4",
    };

    let val_res = validator.validate(&invalid_cpu_event);
    assert!(matches!(val_res, Err(CoreError::ValidationError(_))));

    let empty_id_event = TelemetryEvent {
        event_id: "   ",
        timestamp_utc: "2026-10-20T18:00:00Z",
        source_service: "auth-service",
        host_id: "node-1",
        metrics: Metrics {
            cpu_usage_pct: 50.0,
            memory_rss_mb: 2048.0,
            latency_p99_ms: 50.0,
            error_rate_pct: 0.0,
        },
        raw_log: "info",
        compression: "lz4",
    };
    assert!(matches!(
        validator.validate(&empty_id_event),
        Err(CoreError::ValidationError(_))
    ));
}

#[test]
fn test_storage_wal_and_lz4_integration() {
    let compressor = Lz4Compressor::new();
    let sample_data = b"LOG_LINE_1: critical error in payment module; LOG_LINE_2: retry count exceeded";

    let compressed = compressor.compress(sample_data).expect("Compress");
    assert!(!compressed.is_empty());

    let mut wal = RingBufferWal::new(100);
    let offset1 = wal.append(&compressed).expect("Append 1");
    let read1 = wal.read_offset(offset1, compressed.len()).expect("Read 1");
    let decomp1 = compressor.decompress(&read1).expect("Decompress 1");
    assert_eq!(decomp1, sample_data);

    // Test buffer full error
    let huge_data = vec![0u8; 200];
    assert_eq!(wal.append(&huge_data), Err(StorageError::BufferFull));
}

#[test]
fn test_multiple_events_ingestion_and_wal_buffering() {
    let mut wal = RingBufferWal::new(1024);
    let compressor = Lz4Compressor::new();
    let parser = JsonEventParser::new();
    let validator = DefaultEventValidator::new();

    let events_json = [
        sample_telemetry_json(),
        br#"{
            "event_id": "evt_11111111",
            "timestamp_utc": "2026-10-20T18:01:00Z",
            "source_service": "auth-service",
            "host_id": "node-us-east-01",
            "metrics": {
                "cpu_usage_pct": 12.5,
                "memory_rss_mb": 512.0,
                "latency_p99_ms": 15.0,
                "error_rate_pct": 0.0
            },
            "raw_log": "INFO [auth] User session created",
            "compression": "lz4"
        }"#,
    ];

    let mut stored_offsets = Vec::new();

    for raw in &events_json {
        let event = parser.parse(raw).expect("Parse success");
        validator.validate(&event).expect("Validation success");
        let compressed = compressor.compress(event.raw_log.as_bytes()).expect("Compress");
        let offset = wal.append(&compressed).expect("WAL append");
        stored_offsets.push((offset, compressed.len(), event.raw_log));
    }

    for (offset, len, expected_log) in stored_offsets {
        let read_bytes = wal.read_offset(offset, len).expect("Read offset");
        let decompressed = compressor.decompress(&read_bytes).expect("Decompress");
        assert_eq!(String::from_utf8(decompressed).unwrap(), expected_log);
    }
}

fn spawn_live_http_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind live test listener");
    let addr = listener.local_addr().unwrap().to_string();
    let server = Arc::new(TelemetryServer::new());
    let events: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(
        INITIAL_EVENTS.iter().map(|s| s.to_string()).collect(),
    ));

    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let srv = Arc::clone(&server);
            let evts = Arc::clone(&events);
            thread::spawn(move || {
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
    });

    addr
}

#[test]
fn test_live_http_server_endpoints() {
    let addr = spawn_live_http_server();

    // 1. Test GET /healthz
    {
        let mut stream = TcpStream::connect(&addr).expect("connect to live server");
        let req = "GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        stream.write_all(req.as_bytes()).unwrap();

        let mut resp = String::new();
        stream.read_to_string(&mut resp).unwrap();
        assert!(resp.contains("HTTP/1.1 200 OK"));
        assert!(resp.contains(r#""status":"ok""#));
        assert!(resp.contains(r#""service":"telemetry-ingestor""#));
    }

    // 2. Test GET /v1/events
    {
        let mut stream = TcpStream::connect(&addr).expect("connect to live server");
        let req = "GET /v1/events HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        stream.write_all(req.as_bytes()).unwrap();

        let mut resp = String::new();
        stream.read_to_string(&mut resp).unwrap();
        assert!(resp.contains("HTTP/1.1 200 OK"));
        assert!(resp.contains("evt_9f8a7b6c"));
    }

    // 3. Test POST /v1/ingest (Valid payload)
    {
        let mut stream = TcpStream::connect(&addr).expect("connect to live server");
        let body = r#"{"event_id":"evt_live_test","timestamp_utc":"2026-10-21T03:15:00Z","source_service":"integration-test","host_id":"node-01","metrics":{"cpu_usage_pct":50.0,"memory_rss_mb":1024,"latency_p99_ms":100.0,"error_rate_pct":0.0},"raw_log":"INFO test log","compression":"lz4"}"#;
        let req = format!(
            "POST /v1/ingest HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(req.as_bytes()).unwrap();

        let mut resp = String::new();
        stream.read_to_string(&mut resp).unwrap();
        assert!(resp.contains("HTTP/1.1 200 OK"));
        assert!(resp.contains(r#""event_id":"evt_live_test""#));
    }

    // 4. Test POST /v1/ingest (Invalid payload)
    {
        let mut stream = TcpStream::connect(&addr).expect("connect to live server");
        let req = "POST /v1/ingest HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        stream.write_all(req.as_bytes()).unwrap();

        let mut resp = String::new();
        stream.read_to_string(&mut resp).unwrap();
        assert!(resp.contains("HTTP/1.1 400 Bad Request"));
        assert!(resp.contains(r#""error":"invalid telemetry payload""#));
    }

    // 5. Test Fallback / route
    {
        let mut stream = TcpStream::connect(&addr).expect("connect to live server");
        let req = "GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        stream.write_all(req.as_bytes()).unwrap();

        let mut resp = String::new();
        stream.read_to_string(&mut resp).unwrap();
        assert!(resp.contains("HTTP/1.1 200 OK"));
        assert!(resp.contains(r#""service":"initiative-01-telemetry-ingestor""#));
    }
}
