# Initiative 02 — Anomaly Sentinel (Python 3.12)

## Misión del Escuadrón (5 Agentes Jules)
Construir el motor estadístico y heurístico de detección de anomalías que consume `TelemetryEvent` y emite `AnomalyAlert` según `../ROADMAP.md`.

### Asignación de Subcarpetas (Prohibido modificar archivos fuera de tu capa):
- **`J2-Arch`**: `initiative-02/CONTRACT.md` y `initiative-02/pyproject.toml`
- **`J2-Core`**: `initiative-02/detectors/` (Detectores estadísticos Z-Score y series temporales)
- **`J2-Rules`**: `initiative-02/rules/` (Motor declarativo de reglas de seguridad)
- **`J2-API`**: `initiative-02/api/` (Servicio REST de evaluación en tiempo real y por lotes)
- **`J2-QA`**: `initiative-02/tests/` y `initiative-02/Dockerfile` (Ejecución de `pytest` sin acceso a red)
