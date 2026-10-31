# Conventional pumping baseline (reservoir-level hysteresis)

`baseline/` simulates a conventional controller that runs pumps from the
reservoir level, so the MILP optimizer can be compared against a documented,
reproducible reference.

The baseline used for comparison is a **modified conventional control policy**:
standard level hysteresis plus an explicit end-of-day recovery requirement. It
is **simulated operation, not an optimized solution**, and it doesn't represent
Hamilton's or any other specific utility's operation.
- **No solver:** none is used, and results have no `status` field, so they can't be mistaken for an optimizer status.
- **Inputs:** the ILLUSTRATIVE scenario (`optimizer.model.illustrative_request`), not real utility data.
- **Settings:** every threshold, the recovery start time and the margin are settings under test, not validated ones.

## Run it

```bash
.venv/bin/python -m baseline.compare                # modified policy (with recovery) vs optimizer
.venv/bin/python -m baseline.compare --no-recovery  # original proposal, for reference
.venv/bin/python -m baseline.compare --json         # full JSON incl. controller decision log
.venv/bin/python -m pytest baseline/tests -v        # 99 baseline tests
```

The optimizer, checker and API are unchanged. The baseline reuses the
optimizer's request parser, so events and availability mean the same thing for
both schedules.

## Policy

The controller decides once per 15-minute slot, using the volume at the
**start** of the slot (the same convention as `tank_m3`).

### Level hysteresis (all day, unchanged from the proposal)

| Role | Pump (illustrative) | Start when | Stop when |
|---|---|---|---|
| Lead | P2 (50 kW / 65 m³/h = 0.77 kWh/m³) | V ≤ 650 m³ | V ≥ 950 m³ |
| Lag (backup) | P1 (80 kW / 100 m³/h = 0.80 kWh/m³) | V ≤ 550 m³ | V ≥ 650 m³ |

- **Lead pump:** the usable pump with the lowest specific energy (kW ÷ flow). A pump is usable when it is available and not in an outage. If P2 is unavailable or out, P1 takes over the lead role with the 650/950 m³ thresholds.
- **Peak electricity windows** are ignored by design.

### End-of-day recovery (the modification)

The recovery window runs from 20:00 (slot 80) to midnight. The target is the
initial volume plus 25 m³, so **875 m³** in the illustrative case.

| Role | Start when | Stop when |
|---|---|---|
| Lead | V < 875 m³ | V ≥ 950 m³ (unchanged) |
| Lag | V < 875 m³ | V ≥ 875 m³ |

- **Settings:** `RECOVERY_SETTINGS` in `baseline/hysteresis.py`. The 20:00 start and 25 m³ margin are proposed illustrative values.
- **No forecast:** the rule reacts to the level only and uses no demand forecast, so it can't *guarantee* the end-of-day volume. The checker decides.

### Equipment rules (always obeyed, never overridden)

These apply to every start and stop, including **P1 backup activation** (at
550 m³ in normal operation, and below the target during recovery) and P1
taking over the lead role.
- **No bypass:** a low level never overrides the rules below. If P1 is still inside its minimum off time, or has used all its starts, the start is blocked and logged, and the tank is left to the checker.
- **Recovery has the same limits:** this is why the recovery rule can't always succeed (see Known limits).

The rules:
- A stop is held until the run has lasted `min_run_slots`.
- A start is blocked while `min_off_slots` hasn't elapsed or `max_starts_per_day` is used up.
- A start is also blocked if its minimum run couldn't finish before midnight or before a scheduled outage of that pump. There are no late starts.
- Unavailable pumps never run.
- **Tank rules are checked afterwards.** Capacity and the 450 m³ floor (200 operating + 250 fire reserve) are outcomes, verified by the independent checker. The controller does not steer toward them.
- **Initial state:** all pumps off at 00:00 with their minimum off time already satisfied, the same assumption as the optimizer and checker.

### Settings validation

`HysteresisSettings` raises `InvalidSettings` for:
- **Bad values:** NaN, ±infinity, negative or non-numeric thresholds or margin (including booleans and strings).
- **Bad recovery start:** a `recovery_start_slot` that isn't `None` or an integer from 0 to 95. Floats, `"HH:MM"` strings and booleans are rejected.
- **Inconsistent thresholds:**
  - start ≥ stop, for either the lead or the lag pump;
  - the lag pump starting above the lead start;
  - the lag pump stopping above the lead stop.

`simulate_baseline()` also rejects, for the request's tank:
- any threshold outside [floor, capacity], i.e. [450, 1200] m³ here;
- a recovery target (initial + margin) above capacity.

### How the checker is reused

`check_baseline()` passes the baseline schedule to `optimizer/checker.py`.
- **Status workaround:** the checker only inspects results whose status is `optimal` or `feasible_timeout`. A private view therefore passes `feasible_timeout` to get past that gate. The view is never returned, stored or shown, and the baseline itself carries no solver status.
- **What it checks:** mass balance, loads, tank bounds, end-of-day volume, availability, outages, minimum run/off times, starts, and the reported peak-window kW.

## Results: illustrative scenario, identical inputs

| Metric | Modified conventional baseline | Optimizer |
|---|---|---|
| Independent checker | **valid**, no violations | **valid** (`optimal`), no violations |
| Peak-window site kW (16:00–20:00, incl. 30 kW base) | 160.0 | 30.0 |
| Pump energy kWh | 1437.5 | 1415.0 |
| Minimum tank m³ (all 97 boundaries; floor 450) | 548.6 | 491.4 |
| End-of-day tank m³ (start 850.0) | 881.7 | 850.5 |
| Pump starts | P1 2, P2 1 | P1 2, P2 2 |

**Baseline sequence:**
- P2 starts at slot 13 (V = 649.7 m³) and runs to midnight.
- P1 runs as backup at slots 37–41.
- P1 starts again at slot 78 (V = 549.2 m³). At 20:00 recovery takes over and holds it on until slot 93, when V = 879.4 m³ reaches the 875 m³ target.

### Modelled differences (optimized minus baseline)

These are differences between two models of a hypothetical system, not
measured or financial savings.

| Metric | Difference | How to read it |
|---|---|---|
| Peak-window site kW | **−130.0** (160 → 30) | The baseline runs both pumps in the peak window; the optimizer runs no pumps there. This is the main modelled difference. |
| Pump energy kWh | −22.5 | **Not an efficiency difference.** The baseline ends 31.25 m³ fuller, about 24.0–25.0 kWh of pumping at 0.769–0.800 kWh/m³, which covers the whole gap. Under these inputs the two use about the same energy for the same water. The CLI prints this as a note under the comparison, and the JSON output has it as `energy_note`. |
| Minimum tank m³ | −57.2 | The optimizer runs the tank lower but stays 41 m³ above the 450 m³ floor. |
| End-of-day m³ | −31.25 | Both meet the ≥ 850 m³ requirement. |

### Sensitivity of the recovery settings

On the illustrative scenario the baseline passes the checker for **every**
tested recovery start time from 16:00 to 22:00, with margins of 0, 25 or 50 m³
(21 combinations). The tests cover all of them.

A 23:00 start is too late: the day ends at 756.7 m³ and fails. So the result
doesn't depend on a finely tuned setting.

### Original proposal (no recovery rule), for reference

With the same hysteresis and no recovery rule, the checker reports
`final volume is below initial volume`. The day ends at 656.7 m³ because P2
alone can supply at most 1,560 m³ against a daily demand of 1,817 m³. That
version isn't used for comparison. Run `--no-recovery` to reproduce it.

## Known limits of the recovery rule (pinned in tests)

| Scenario | Modified baseline | Optimizer |
|---|---|---|
| Fire 17:00–19:00, +30 m³/slot | valid (min 455.8 m³) | optimal |
| P2 outage 05:00–07:00 | valid | optimal |
| **P2 unavailable all day** | **fails:** end 733.0 m³ < 850 | optimal |
| **P1 outage 20:00–24:00** | **fails:** end 506.7 m³ < 850 | optimal |

- **Why it fails:** with only one pump left, recovery from 20:00 can't make up the shortfall. A level-only rule has no forecast to start earlier.
- **Rule:** in these cases no baseline comparison may be reported. `compare()` withholds the differences automatically whenever either schedule fails the checker.
- **Possible fix:** start recovery earlier, or add forecast-based recovery, when a pump is lost. That would be a further policy change and needs approval.

## Limitations

- **Data:** illustrative inputs and settings only.
- **Not observed operation:** this is a model of a modified conventional rule, not a record of what any operator or utility (including Hamilton's) does. Real controllers act continuously, and this one acts once per 15-minute slot.
- **Model:** a simple storage balance only, with no pipe or pressure behaviour (no hydraulics), and no carry-over of pump state from the previous day.
- **Peak windows:** ignoring them is a design choice, and it is why the baseline's peak-window kW is high.
- **Not savings:** reported differences are modelled differences on a hypothetical system, not measured or financial savings.

## API

The same comparison is served by `POST /compare` (same request body as `/optimize`). The contract and display rules are in [docs/frontend_handoff.md §13](frontend_handoff.md#13-baseline-vs-optimizer-comparison-post-compare).
