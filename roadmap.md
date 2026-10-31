# PEAKFIVE backend integration

## Hamilton municipal case study
- [ ] Add official historical infrastructure context, transparency labels and connected scenario entry points.
- [ ] Add a five-stage actual-backend Hamilton demonstration and retain operational scenario controls.
- [ ] Add prospective pilot requirements and carbon context without inventing savings or affiliation.
- [ ] Verify sources, defaults, live workflow, playback, scenarios and carbon reporting.

- [x] Inspect the existing interface and identify integration dependencies.
- [x] Obtain authoritative frontend_handoff.md.
- [x] Obtain Render production URL https://peakfive-api.onrender.com; verify production-origin CORS.
- [x] Configure the production API address while preserving the existing design.
- [x] Test real schedule playback, charts, pump animations, fire/outage scenarios and clear failure states (54 regression tests passed).
- [ ] Permit editor preview/local CORS on Render (requires owner to add the preview origin and http://localhost:8080 to PEAKFIVE_CORS_ORIGINS; production origin already passes).
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