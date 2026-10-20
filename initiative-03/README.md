# Initiative 03 — Incident Orchestrator (Go 1.22)

## Misión del Escuadrón (5 Agentes Jules)
Construir el orquestador concurrente de incidentes que consume `AnomalyAlert`, deduplica alertas y gestiona `IncidentRecord` según `../ROADMAP.md`.

### Asignación de Subcarpetas (Prohibido modificar archivos fuera de tu capa):
- **`J3-Arch`**: `initiative-03/CONTRACT.md` y `initiative-03/go.mod`
- **`J3-Core`**: `initiative-03/engine/` (Máquina de estados concurrente y deduplicador)
- **`J3-Data`**: `initiative-03/store/` (Almacenamiento e historial inmutable de incidentes)
- **`J3-API`**: `initiative-03/api/` (API HTTP de incidentes y disparo de runbooks)
- **`J3-QA`**: `initiative-03/tests/` y `initiative-03/Dockerfile` (Ejecución de `go test -race ./...` sin red)
