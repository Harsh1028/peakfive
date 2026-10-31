"""Conventional reservoir-level hysteresis baseline for PEAKFIVE.

SIMULATED CONVENTIONAL OPERATION, not an optimized solution: no solver is used
and nothing here claims optimality. Thresholds are illustrative settings under
test, not validated operating rules for any real utility.

Control policy (evaluated once per slot on V[t], the START-of-slot volume)
  Ranking   pumps are ranked by specific energy kWh/m3 = kw / flow_m3h (lowest
            first). The best-ranked pump usable in slot t is LEAD, the next is
            LAG. Usable = available and not in a pump_outage in slot t. If the
            preferred pump (P2 in the illustrative case) is unusable, the next
            pump takes over the lead role with the lead thresholds.
  Lead      start when V[t] <= lead_start_m3 (650); stop when V[t] >= lead_stop_m3 (950)
  Lag       start when V[t] <= lag_start_m3 (550);  stop when V[t] >= lag_stop_m3 (650)
  Other     pumps beyond the second usable one stay OFF.
  Peak electricity windows are ignored by design.

End-of-day recovery (optional; RECOVERY_SETTINGS enables it)
  From recovery_start_slot to midnight the target is initial_m3 +
  recovery_margin_m3. In that window lead AND lag start when V[t] < target,
  and the lag pump stops only when V[t] >= target (the lead pump keeps its
  950 m3 stop). Outside the window the hysteresis above is unchanged. The rule
  uses no demand forecast, so it cannot guarantee V[96] >= V[0]; the checker
  decides. This makes a MODIFIED conventional policy, not a description of any
  specific utility's operation.

Settings validation
  HysteresisSettings rejects NaN, infinity, negative or non-numeric values,
  non-integer or out-of-range recovery_start_slot, and inconsistent thresholds
  (start >= stop, lag starting above lead or stopping above lead).
  simulate_baseline() also rejects thresholds outside [floor, capacity] and a
  recovery target above capacity. Both raise InvalidSettings.

Equipment rules the controller obeys (it never overrides them; this includes
P1 backup activation and every recovery-rule start)
  * A requested stop is held until the run has lasted min_run_slots.
  * A requested start is blocked if the pump is unusable, is still inside
    min_off_slots since its last stop, has used max_starts_per_day, or could
    not complete min_run_slots before midnight or before a scheduled outage of
    that pump (the model's run-completion rule).
  * A running pump is stopped when it becomes unusable.
  Initial state matches the optimizer and checker: all pumps OFF before 00:00
  with min-off already satisfied.

Tank rules are outcomes, not controls
  Capacity, the min_operating_m3 + fire_reserve_m3 floor and the end-of-day
  volume V[96] >= V[0] are NOT steered toward. They are verified afterwards by
  the independent checker (optimizer/checker.py) via check_baseline().
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

from optimizer.checker import check_schedule
from optimizer.model import SLOT_HOURS, SLOTS, _parse

LABEL = ("Simulated conventional operation (reservoir-level hysteresis). "
         "Not an optimized solution; no solver was used.")
RECOVERY_LABEL = ("Simulated modified conventional operation (reservoir-level hysteresis with an "
                  "end-of-day recovery requirement). Not an optimized solution; no solver was "
                  "used. Illustrative; does not represent any specific utility.")


@dataclass(frozen=True)
class HysteresisSettings:
    """Illustrative thresholds under test (m3), not validated settings."""
    lead_start_m3: float = 650.0
    lead_stop_m3: float = 950.0
    lag_start_m3: float = 550.0
    lag_stop_m3: float = 650.0
    recovery_start_slot: Optional[int] = None  # None = no end-of-day recovery rule
    recovery_margin_m3: float = 0.0

    def __post_init__(self) -> None:
        for name in ("lead_start_m3", "lead_stop_m3", "lag_start_m3", "lag_stop_m3",
                     "recovery_margin_m3"):
            value = getattr(self, name)
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise InvalidSettings(f"{name} must be a finite number >= 0, got {value!r}")
        if not self.lead_start_m3 < self.lead_stop_m3:
            raise InvalidSettings("lead_start_m3 must be below lead_stop_m3")
        if not self.lag_start_m3 < self.lag_stop_m3:
            raise InvalidSettings("lag_start_m3 must be below lag_stop_m3")
        if self.lag_start_m3 > self.lead_start_m3:
            raise InvalidSettings("lag_start_m3 must not exceed lead_start_m3 (backup starts after lead)")
        if self.lag_stop_m3 > self.lead_stop_m3:
            raise InvalidSettings("lag_stop_m3 must not exceed lead_stop_m3")
        slot = self.recovery_start_slot
        if slot is not None and (type(slot) is not int or not 0 <= slot < SLOTS):
            raise InvalidSettings(f"recovery_start_slot must be None or an integer slot 0-{SLOTS - 1}, "
                                  f"got {slot!r}")


class InvalidSettings(ValueError):
    """Controller settings are malformed or inconsistent with each other or the tank."""


def _check_against_tank(settings: HysteresisSettings, tank: Dict[str, float]) -> None:
    floor = tank["min_operating_m3"] + tank["fire_reserve_m3"]
    capacity = tank["capacity_m3"]
    for name in ("lead_start_m3", "lead_stop_m3", "lag_start_m3", "lag_stop_m3"):
        value = getattr(settings, name)
        if not floor <= value <= capacity:
            raise InvalidSettings(f"{name} = {value:g} m3 is outside the tank band "
                                  f"[{floor:g}, {capacity:g}] m3")
    if settings.recovery_start_slot is not None:
        target = tank["initial_m3"] + settings.recovery_margin_m3
        if target > capacity:
            raise InvalidSettings(f"recovery target {target:g} m3 (initial + margin) exceeds "
                                  f"capacity {capacity:g} m3")


# Modified conventional policy: unchanged hysteresis plus end-of-day recovery
# from 20:00 (slot 80) to initial volume + 25 m3. Both values are proposed
# illustrative settings, not validated ones.
RECOVERY_SETTINGS = HysteresisSettings(recovery_start_slot=80, recovery_margin_m3=25.0)


def _rank(pumps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Lowest specific energy first; pumps with zero flow can never help.
    # Ties keep input order (sorted is stable), so ranking is deterministic.
    return sorted((p for p in pumps if p["flow_m3h"] > 0), key=lambda p: p["kw"] / p["flow_m3h"])


def _start_block(p: Dict[str, Any], t: int, state: Dict[str, Any],
                 forced_off: set) -> Optional[str]:
    """Reason a start of pump p at slot t is not allowed, or None."""
    if state["starts"] >= p["max_starts_per_day"]:
        return f"max_starts_per_day ({p['max_starts_per_day']}) used"
    if state["off_since"] is not None and t - state["off_since"] < p["min_off_slots"]:
        return f"min_off_slots ({p['min_off_slots']}) not elapsed"
    end = t + p["min_run_slots"]
    if end > SLOTS:
        return f"min_run_slots ({p['min_run_slots']}) cannot complete before midnight"
    if any(k in forced_off for k in range(t, end)):
        return f"min_run_slots ({p['min_run_slots']}) would overlap a scheduled outage"
    return None


def simulate_baseline(request: Dict[str, Any],
                      settings: HysteresisSettings = HysteresisSettings()) -> Dict[str, Any]:
    """Run the hysteresis controller over one day.

    Uses the optimizer's request parser so events and availability mean exactly
    the same thing for both schedules. Raises optimizer.model.InvalidRequest on
    malformed input and InvalidSettings when the settings do not fit the tank.
    Deterministic: no randomness, clock or solver.
    """
    if not isinstance(settings, HysteresisSettings):
        raise InvalidSettings("settings must be a HysteresisSettings instance")
    cfg = _parse(request)
    _check_against_tank(settings, cfg["tank"])
    pumps = cfg["pumps"]
    ranked = _rank(pumps)
    base = cfg["base_load_kw"]
    state = {p["id"]: {"on": False, "run": 0, "off_since": None, "starts": 0} for p in pumps}

    def usable(p: Dict[str, Any], t: int) -> bool:
        return p["available"] and t not in cfg["forced_off"][p["id"]]

    vol = cfg["tank"]["initial_m3"]
    target = vol + settings.recovery_margin_m3
    schedule: List[Dict[str, Any]] = []
    log: List[Dict[str, Any]] = []
    for t in range(SLOTS):
        candidates = [p for p in ranked if usable(p, t)]
        recovering = settings.recovery_start_slot is not None and t >= settings.recovery_start_slot
        # Role = (name, start when V <= this, stop when V >= this). Recovery
        # starts on V < target, expressed as V <= target - 1e-9.
        roles = {}
        if candidates:
            roles[candidates[0]["id"]] = (
                ("lead recovery", target - 1e-9, settings.lead_stop_m3) if recovering
                else ("lead", settings.lead_start_m3, settings.lead_stop_m3))
        if len(candidates) > 1:
            roles[candidates[1]["id"]] = (
                ("lag recovery", target - 1e-9, target) if recovering
                else ("lag", settings.lag_start_m3, settings.lag_stop_m3))

        for p in pumps:
            pid, st = p["id"], state[p["id"]]
            role = roles.get(pid)
            want_on = st["on"]
            if role is None:
                want_on = False
            elif not st["on"] and vol <= role[1]:
                want_on = True
            elif st["on"] and vol >= role[2]:
                want_on = False

            note = None
            if want_on and not st["on"]:
                block = _start_block(p, t, st, cfg["forced_off"][pid])
                if block is None:
                    st.update(on=True, run=0, starts=st["starts"] + 1)
                    note = f"start ({role[0]}, V={vol:.1f} <= {role[1]:g})"
                else:
                    note = f"start blocked ({role[0]}, V={vol:.1f}): {block}"
            elif st["on"] and not want_on:
                if not usable(p, t):
                    st.update(on=False, off_since=t)
                    note = "forced off (unavailable or outage)"
                elif st["run"] < p["min_run_slots"]:
                    note = f"stop held: min_run_slots ({p['min_run_slots']}) not reached"
                else:
                    st.update(on=False, off_since=t)
                    note = (f"stop ({role[0]}, V={vol:.1f} >= {role[2]:g})" if role
                            else "stop (no role)")
            if note:
                log.append({"slot": t, "pump": pid, "tank_m3": vol, "action": note})

        running = [p["id"] for p in pumps if state[p["id"]]["on"]]
        schedule.append({
            "slot": t,
            "pumps_on": running,
            "kw": base + sum(p["kw"] for p in pumps if p["id"] in running),
            "tank_m3": vol,  # volume at the START of slot t
        })
        for pid in running:
            state[pid]["run"] += 1
        vol += SLOT_HOURS * sum(p["flow_m3h"] for p in pumps if p["id"] in running) - cfg["demand"][t]

    peak_kw = max((schedule[t]["kw"] for t in cfg["peak"]), default=None)
    return {
        "mode": ("simulated_conventional_operation" if settings.recovery_start_slot is None
                 else "simulated_modified_conventional_operation"),
        "label": LABEL if settings.recovery_start_slot is None else RECOVERY_LABEL,
        "settings": asdict(settings),
        "schedule": schedule,
        "peak_window_kw": peak_kw,
        "end_of_day_m3": vol,
        "controller_log": log,
    }


def check_baseline(request: Dict[str, Any], baseline: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a baseline schedule with the independent checker.

    check_schedule() only inspects results whose status is 'optimal' or
    'feasible_timeout' (it rejects every other status before checking). This
    private view supplies 'feasible_timeout' ONLY to pass that gate so the
    schedule is actually verified; it is never returned, stored or shown, and
    the baseline itself carries no solver status. The checker also verifies
    peak_window_kw against its own reconstruction of the peak-window load.
    """
    view = {
        "status": "feasible_timeout",
        "schedule": baseline["schedule"],
        "coincident_kw_before": None,
        "coincident_kw_after": baseline["peak_window_kw"],
        "explanation": baseline["label"],
    }
    return check_schedule(request, view)


def schedule_metrics(request: Dict[str, Any], schedule: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Metrics computed the same way for any 96-row schedule.

    Loads and volumes are rebuilt from pumps_on and the request (not read from
    the rows), so baseline and optimized schedules are measured identically.
    """
    cfg = _parse(request)
    kw = {p["id"]: p["kw"] for p in cfg["pumps"]}
    flow = {p["id"]: p["flow_m3h"] for p in cfg["pumps"]}
    base = cfg["base_load_kw"]
    vol = [cfg["tank"]["initial_m3"]]
    site_kw = []
    for t, row in enumerate(schedule):
        site_kw.append(base + sum(kw[pid] for pid in row["pumps_on"]))
        vol.append(vol[-1] + SLOT_HOURS * sum(flow[pid] for pid in row["pumps_on"]) - cfg["demand"][t])
    starts = {}
    for pid in kw:
        on = [pid in row["pumps_on"] for row in schedule]
        starts[pid] = sum(1 for t in range(len(on)) if on[t] and (t == 0 or not on[t - 1]))
    return {
        "peak_window_kw": max((site_kw[t] for t in cfg["peak"]), default=None),
        "pump_energy_kwh": SLOT_HOURS * sum(k - base for k in site_kw),
        "site_energy_kwh": SLOT_HOURS * sum(site_kw),
        "min_tank_m3": min(vol),
        "end_of_day_m3": vol[-1],
        "initial_m3": vol[0],
        "pump_starts": starts,
        "pump_slots_on": {pid: sum(pid in row["pumps_on"] for row in schedule) for pid in kw},
    }
