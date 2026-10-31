# PEAKFIVE backend integration

- [x] Inspect the existing interface and identify integration dependencies.
- [x] Obtain authoritative frontend_handoff.md.
- [ ] Obtain the deployed HTTPS backend base URL and allowed dashboard origin (waiting for teammate's deployment details).
- [x] Implement typed health/optimization client with a 45-second timeout.
- [x] Adapt shared schedule state and visualizations to actual results and backend statuses.
- [x] Add the specified system defaults and fire/pump-outage controls.
- [x] Separate demo schedules and suppress unsupported baseline savings claims.
- [x] Test request/response rules (36 tests pass) and browser wiring with explicitly mocked contract responses.
- [ ] Verify optimization end-to-end against the real backend (blocked by missing deployed backend URL).