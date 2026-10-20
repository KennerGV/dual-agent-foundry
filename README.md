# Dual Agent Foundry — Ecosistema AegisPulse

Repositorio de desarrollo autónomo multi-agente donde escuadrones de **Jules** construyen la plataforma **AegisPulse** en 5 iniciativas políglotas y **Antigravity (`Dual Agent Foundry Reviewer`)** audita cada Pull Request cada hora en contenedores Docker aislados.

---

## Arquitectura de los 5 Proyectos (`AegisPulse`)

| Carpeta | Proyecto | Lenguaje | Escuadrón Jules (5 Agentes) | Subcarpetas Aisladas |
| :--- | :--- | :--- | :--- | :--- |
| `initiative-01/` | **Telemetry Ingestor** | **Rust** | `J1-Arch`, `J1-Core`, `J1-Storage`, `J1-API`, `J1-QA` | `core/`, `storage/`, `api/`, `tests/` |
| `initiative-02/` | **Anomaly Sentinel** | **Python 3.12** | `J2-Arch`, `J2-Core`, `J2-Rules`, `J2-API`, `J2-QA` | `detectors/`, `rules/`, `api/`, `tests/` |
| `initiative-03/` | **Incident Orchestrator** | **Go 1.22** | `J3-Arch`, `J3-Core`, `J3-Data`, `J3-API`, `J3-QA` | `engine/`, `store/`, `api/`, `tests/` |
| `initiative-04/` | **Chaos Verifier** | **Node.js / TS** | `J4-Arch`, `J4-Core`, `J4-Runner`, `J4-CLI`, `J4-QA` | `scenarios/`, `runner/`, `cli/`, `tests/` |
| `initiative-05/` | **Command Center UI** | **React / TS** | `J5-Arch`, `J5-BFF`, `J5-UI-Core`, `J5-Chaos-UI`, `J5-QA` | `bff/`, `components/`, `views/`, `tests/` |

---

## Reglas de Gobernanza y Seguridad

1. **Aislamiento Estricto por Subcarpeta:** Cada agente de Jules trabaja exclusivamente dentro de su subcarpeta asignada respetando el archivo `CONTRACT.md` de su iniciativa para evitar conflictos de fusión (*Merge Conflicts*).
2. **Sandbox en Docker (`--network none`):** Cada `initiative-0X/` incluye su propio `Dockerfile` cuyo `CMD` ejecuta todas las pruebas de la iniciativa sin requerir red en tiempo de ejecución.
3. **Cortacircuitos (*Death Loop Breaker*):** Máximo **3 intentos fallidos (`CHANGES_REQUESTED`)** por Pull Request antes de pausar el ciclo y escalar a `@KennerGV`.
4. **Sin Auto-Merge a `main`:** Antigravity audita, ejecuta pruebas en Docker, aprueba el PR y documenta el diagrama Mermaid en `ARCHITECTURE_DIGEST.md`, dejando el merge final a `@KennerGV`.
