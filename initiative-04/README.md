# Initiative 04 — Chaos Verifier (Node.js / TypeScript)

## Misión del Escuadrón (5 Agentes Jules)
Construir el simulador de Ingeniería del Caos que inyecta escenarios sintéticos de fallos y genera `ChaosExperimentResult` según `../ROADMAP.md`.

### Asignación de Subcarpetas (Prohibido modificar archivos fuera de tu capa):
- **`J4-Arch`**: `initiative-04/CONTRACT.md`, `initiative-04/package.json` y `initiative-04/tsconfig.json`
- **`J4-Core`**: `initiative-04/scenarios/` (Catálogo y generadores de fallos sintéticos)
- **`J4-Runner`**: `initiative-04/runner/` (Ejecutor de experimentos y cálculo de MTTR)
- **`J4-CLI`**: `initiative-04/cli/` (Interfaz de línea de comandos y exportador de reportes Markdown/JSON)
- **`J4-QA`**: `initiative-04/tests/` y `initiative-04/Dockerfile` (Ejecución de tests automatizados sin red)
