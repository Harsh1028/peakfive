# PEAKFIVE backend integration

## Verified Hamilton water data
- [x] Verify all 36 Table 2-3 production values and Woodward infrastructure (section 2.2.1, page 8) against the official 2025 report; disclose capacity-label differences and unstated publication date.
- [x] Add measured-data dashboard and explicit verified-data / engineering-simulation viewing modes.
- [x] Add provenance-documented operational JSON import with interval, timezone, unit and duplicate validation, isolated from optimization; user attestation is not independent authenticity verification.
- [x] Update guided demonstration to six stages with real production evidence and simulated-schedule emissions.
- [x] Test exact published values, import rules (89 tests), live 96-slot optimization, playback, changed-constraint recalculation, Climatiq and full presentation flow; verify narrow-screen measured-data view.

## Hamilton municipal case study
- [x] Add historical infrastructure context, transparency labels and connected scenario entry points; Woodward capacity verified.
- [x] Add a five-stage actual-backend Hamilton demonstration and retain operational scenario controls.
- [x] Add prospective pilot requirements and carbon context without inventing savings or affiliation.
- [x] Verify unchanged defaults (56 tests), live normal/fire/outage solves, 96-slot timelines, playback, infeasibility, connection errors, actual Climatiq reporting and narrow-screen layouts with normal browser security.
- [x] Replace unconfirmed 2024 city-wide figures with confirmed 2025 Woodward-subsystem infrastructure from the accessible annual report; preserve the different reporting scope.

- [x] Inspect the existing interface and identify integration dependencies.
- [x] Obtain authoritative frontend_handoff.md.
- [x] Obtain Render production URL https://peakfive-api.onrender.com; verify production-origin CORS.
- [x] Configure the production API address while preserving the existing design.
- [x] Test real schedule playback, charts, pump animations, fire/outage scenarios and clear failure states (54 regression tests passed).
- [x] Local Render CORS now permits http://localhost:8080; complete Hamilton UI flow passed with normal browser security.
- [x] Implement typed health/optimization client with a 45-second timeout.
- [x] Adapt shared schedule state and visualizations to actual results and backend statuses.
- [x] Add the specified system defaults and fire/pump-outage controls.
- [x] Separate demo schedules and suppress unsupported baseline savings claims.
- [x] Test request/response rules (36 tests pass) and browser wiring with explicitly mocked contract responses.
- [x] Verify optimization end-to-end against the real Render backend (production-origin browser health/solve passed; complete local UI flow used genuine responses with browser CORS enforcement disabled because local origin is not allowed).

## Carbon Intelligence
- [x] Configure secure Climatiq access and verify its electricity contract with a real CA-ON response (2024 Government of Canada factor).
- [x] Add schedule-linked carbon accounting, exact-input caching and failure handling.
- [x] Add Carbon Intelligence, overview summary and optional presentation stage.
- [x] Test accounting rules (53 tests passing), live Climatiq UI calculations, scenario changes and presentation isolation using an explicit validated scheduling fixture.
- [x] Verify carbon reporting after a real deployed FastAPI solve: 1,415 pump kWh → 91.936795 kg CO₂e; facility 2,135 kWh → 138.717355 kg CO₂e; fire 1,607.5 pump kWh → 104.4440975 kg CO₂e. Real Climatiq Ontario 2024 factor and notices displayed; no savings baseline claimed.