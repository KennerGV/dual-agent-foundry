# Initiative 01 — Telemetry Ingestor (Rust)

## Misión del Escuadrón (5 Agentes Jules)
Construir el motor de ingesta de telemetría de baja latencia compatible con el esquema `TelemetryEvent` de `../ROADMAP.md`.

### Asignación de Subcarpetas (Prohibido modificar archivos fuera de tu capa):
- **`J1-Arch`**: `initiative-01/CONTRACT.md` y `initiative-01/Cargo.toml`
- **`J1-Core`**: `initiative-01/core/` (Validación y parser de eventos)
- **`J1-Storage`**: `initiative-01/storage/` (Buffer circular WAL y compresión LZ4)
- **`J1-API`**: `initiative-01/api/` (Endpoints HTTP de ingesta y healthcheck)
- **`J1-QA`**: `initiative-01/tests/` y `initiative-01/Dockerfile` (Ejecución de `cargo test` sin acceso a red)
