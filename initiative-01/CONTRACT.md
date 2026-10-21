# Contract Specification — Initiative 01 (Telemetry Ingestor)

This document defines the technical contracts, data models, trait definitions, public function signatures, and error types for the `initiative-01` Cargo workspace.
It establishes the boundary definitions between the three core layers (`core`, `storage`, `api`) so parallel development can take place independently.

---

## 1. Global Data Model (`TelemetryEvent`)

Derived from `ROADMAP.md` Section 2.1:

```json
{
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
}
```

### 1.1 Data Structs (Core Layer)

```rust
pub struct Metrics {
    pub cpu_usage_pct: f64,
    pub memory_rss_mb: f64,
    pub latency_p99_ms: f64,
    pub error_rate_pct: f64,
}

pub struct TelemetryEvent<'a> {
    pub event_id: &'a str,
    pub timestamp_utc: &'a str,
    pub source_service: &'a str,
    pub host_id: &'a str,
    pub metrics: Metrics,
    pub raw_log: &'a str,
    pub compression: &'a str,
}

pub struct OwnedTelemetryEvent {
    pub event_id: String,
    pub timestamp_utc: String,
    pub source_service: String,
    pub host_id: String,
    pub metrics: Metrics,
    pub raw_log: String,
    pub compression: String,
}
```

---

## 2. Layer Contracts & Interfaces

### 2.1 `core` Layer (Zero-copy Parser & Event Validator)

**Responsibility:** Fast zero-copy parsing of raw byte buffers / JSON strings into `TelemetryEvent` and validation of metric bounds and required fields.

**Traits & Signatures:**

```rust
pub enum CoreError {
    ParseError(String),
    ValidationError(String),
}

pub trait EventParser {
    fn parse<'a>(&self, raw: &'a [u8]) -> Result<TelemetryEvent<'a>, CoreError>;
}

pub trait EventValidator {
    fn validate(&self, event: &TelemetryEvent) -> Result<(), CoreError>;
}
```

---

### 2.2 `storage` Layer (Circular Buffer WAL & LZ4 Compression)

**Responsibility:** Buffering validated events in a circular WAL (Write-Ahead Log) in memory/disk and compressing payloads using LZ4.

**Traits & Signatures:**

```rust
pub enum StorageError {
    WriteError(String),
    ReadError(String),
    CompressionError(String),
    BufferFull,
}

pub trait CircularWal {
    fn append(&mut self, data: &[u8]) -> Result<u64, StorageError>;
    fn read_offset(&self, offset: u64, len: usize) -> Result<Vec<u8>, StorageError>;
}

pub trait Compressor {
    fn compress(&self, input: &[u8]) -> Result<Vec<u8>, StorageError>;
    fn decompress(&self, input: &[u8]) -> Result<Vec<u8>, StorageError>;
}
```

---

### 2.3 `api` Layer (HTTP Ingestion Server & Health Checks)

**Responsibility:** Exposing HTTP endpoints for receiving telemetry events (`POST /ingest`) and checking service health (`GET /health`).

**Traits & Signatures:**

```rust
pub enum ApiError {
    InvalidPayload(String),
    StorageFailure(String),
    InternalError(String),
}

pub trait IngestServer {
    fn handle_ingest(&self, payload: &[u8]) -> Result<IngestResponse, ApiError>;
    fn handle_health(&self) -> HealthStatus;
}

pub struct IngestResponse {
    pub status: String,
    pub event_id: String,
}

pub struct HealthStatus {
    pub status: String,
    pub uptime_seconds: u64,
}
```

---

## 3. Inter-Layer Component Interaction Flow

1. **HTTP Ingestion (`api`)** receives raw JSON payload via `POST /ingest`.
2. **Parser & Validator (`core`)** performs zero-copy deserialization and validates metrics (e.g. CPU % in range 0-100).
3. **Storage Engine (`storage`)** compresses log payload using LZ4 and writes to Circular WAL buffer.
4. **API Handler (`api`)** returns a JSON response acknowledging receipt (`status: "ok"`).
