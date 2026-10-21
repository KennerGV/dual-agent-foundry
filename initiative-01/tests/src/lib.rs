use initiative_01_api::{IngestServer, TelemetryServer};
use initiative_01_core::{
    DefaultEventValidator, EventParser, EventValidator, JsonEventParser,
};
use initiative_01_storage::{CircularWal, Compressor, Lz4Compressor, RingBufferWal};

pub fn integration_harness_ready() -> bool {
    true
}

pub fn sample_telemetry_json() -> &'static [u8] {
    br#"{
        "event_id": "evt_9f8a7b6c",
        "timestamp_utc": "2026-10-20T18:00:00Z",
        "source_service": "payment-gateway-prod",
        "host_id": "node-us-east-04",
        "metrics": {
            "cpu_usage_pct": 94.2,
            "memory_rss_mb": 3840.0,
            "latency_p99_ms": 1420.5,
            "error_rate_pct": 18.4
        },
        "raw_log": "ERROR [conn_pool] timeout acquiring connection after 1000ms",
        "compression": "lz4"
    }"#
}

pub fn run_full_pipeline(
    raw_payload: &[u8],
    wal_capacity: usize,
) -> Result<(u64, Vec<u8>), String> {
    let server = TelemetryServer::new();
    let ingest_resp = server
        .handle_ingest(raw_payload)
        .map_err(|e| format!("API Error: {:?}", e))?;

    if ingest_resp.status != "ok" {
        return Err(format!("API status not ok: {}", ingest_resp.status));
    }

    let parser = JsonEventParser::new();
    let event = parser
        .parse(raw_payload)
        .map_err(|e| format!("Parse Error: {:?}", e))?;

    let validator = DefaultEventValidator::new();
    validator
        .validate(&event)
        .map_err(|e| format!("Validation Error: {:?}", e))?;

    let compressor = Lz4Compressor::new();
    let compressed_log = compressor
        .compress(event.raw_log.as_bytes())
        .map_err(|e| format!("Compression Error: {:?}", e))?;

    let mut wal = RingBufferWal::new(wal_capacity);
    let offset = wal
        .append(&compressed_log)
        .map_err(|e| format!("WAL Append Error: {:?}", e))?;

    let read_back = wal
        .read_offset(offset, compressed_log.len())
        .map_err(|e| format!("WAL Read Error: {:?}", e))?;

    let decompressed = compressor
        .decompress(&read_back)
        .map_err(|e| format!("Decompress Error: {:?}", e))?;

    Ok((offset, decompressed))
}
