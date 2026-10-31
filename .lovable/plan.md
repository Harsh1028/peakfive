# Connect the deployed comparison endpoint

## What will change
- Keep PEAKFIVE’s existing layout, styling, animations, scenarios and verified Hamilton data view.
- Add a **Compare Schedules** action to the overview and Schedule Optimizer. It will call `POST /compare` using the current date, pumps, reservoir, demand and events.
- Display both returned pump schedules, baseline and optimized peak demand, and the returned reduction percentage only when `status` is `comparison_available`.
- Enable existing playback and charts to show either validated schedule; clear old comparisons whenever scenario inputs or the service address change.
- Show a spinner and cold-start notice while waiting, with a bounded 180-second timeout rather than stopping before Render wakes up.
- Show clear unavailable, invalid-input and service-error messages without substituting demo results or missing numbers.
- Retain the backend’s simulation labels, caveats and energy note. No measured Hamilton operations, energy-efficiency savings or financial savings will be claimed.

## What stays unchanged
- The existing `/optimize` action and all Climatiq integration code, credentials and accounting methodology.
- Official Hamilton measurements and IESO demand remain separate from the simulated water-system comparison.

## Technical details
- The deployed OpenAPI specification documents `peak_window` as a two-element time array, such as `["16:00", "20:00"]`, with `date`, `system` and `events`. The comparison client will serialize this exact wire format while retaining the existing slot-based internal model.
- OpenAPI does not declare a response schema. The actual service response has been inspected: `status`, `label`, `explanation`, `peak_window`, `energy`, `baseline`, `optimized` and `caveats`. Validate this shape and independently check both complete 96-slot schedules before display.
- Store comparison results in the shared provider, separate from legacy local demos. Adapt the validated optimized comparison schedule to the existing optimized-result contract so Climatiq continues to read only the optimized schedule, regardless of the playback selection.
- Add regression tests for exact request serialization, response statuses, completeness, metric consistency, timeout and no-fallback behavior. Verify a real browser comparison against Render and confirm chart/playback selection.

## Findings
The deployed example currently returns a valid comparison. Those values are response data, not frontend constants. With P1 unavailable, the service returns `comparison_unavailable` with null comparison metrics and no schedules; the interface will respect that distinction.