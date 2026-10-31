# PEAKFIVE backend integration

- [x] Inspect the existing interface and identify integration dependencies.
- [x] Obtain authoritative frontend_handoff.md.
- [x] Obtain Render production URL https://peakfive-api.onrender.com; verify production-origin CORS.
- [ ] Configure the production API address while preserving the existing design.
- [ ] Test real schedule playback, charts, pump animations, fire/outage scenarios and clear failure states.
- [x] Implement typed health/optimization client with a 45-second timeout.
- [x] Adapt shared schedule state and visualizations to actual results and backend statuses.
- [x] Add the specified system defaults and fire/pump-outage controls.
- [x] Separate demo schedules and suppress unsupported baseline savings claims.
- [x] Test request/response rules (36 tests pass) and browser wiring with explicitly mocked contract responses.
- [ ] Verify optimization end-to-end against the real Render backend.

## Carbon Intelligence
- [x] Configure secure Climatiq access and verify its electricity contract with a real CA-ON response (2024 Government of Canada factor).
- [x] Add schedule-linked carbon accounting, exact-input caching and failure handling.
- [x] Add Carbon Intelligence, overview summary and optional presentation stage.
- [x] Test accounting rules (53 tests passing), live Climatiq UI calculations, scenario changes and presentation isolation using an explicit validated scheduling fixture.
- [ ] Verify carbon reporting after a real deployed FastAPI solve.