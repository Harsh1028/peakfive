"""PEAKFIVE 24-hour pump scheduling optimizer (MILP, PuLP + CBC).

Model summary
-------------
Horizon: 96 slots of 15 minutes. Slot t covers [t*15 min, (t+1)*15 min).

Decision variables
  x[p,t]  binary, pump p is ON during slot t
  s[p,t]  binary, pump p starts at slot t   (OFF in t-1, ON in t)
  d[p,t]  binary, pump p stops at slot t    (ON in t-1, OFF in t)
  V[t]    continuous, tank volume (m3) at boundary t = 0..96 (97 boundaries)
          V[t] is the volume at the START of slot t; V[96] is end of day.
  peak_kw continuous, max total site kW over the peak-window slots

Hard constraints
  1. Mass balance  V[t+1] = V[t] + 0.25 * sum_p flow_m3h[p] * x[p,t] - demand[t]
  2. Bounds        min_operating_m3 + fire_reserve_m3 <= V[t] <= capacity_m3, t=0..96
                   (variable bounds on all 97 V[t], V[0] fixed to initial_m3)
  3. End of day    V[96] >= V[0]
  4. Unavailable pumps (available=false) are OFF in every slot
  5. Min run / min off durations (see boundary assumptions below)
  6. sum_t s[p,t] <= max_starts_per_day
  7. Fire events add extra demand for their duration
  8. Pump outage events force the pump OFF for their duration

Min run / min off formulation (R = min_run_slots, F = min_off_slots)
  s[p,t] - d[p,t] = x[p,t] - x[p,t-1],  s[p,t] + d[p,t] <= 1,  x[p,-1] := 0
  sum_{k=t-R+1..t} s[p,k] <= x[p,t]       a start in the last R slots forces ON
  sum_{k=t-F+1..t} d[p,k] <= 1 - x[p,t]   a stop in the last F slots forces OFF
  s[p,t] = 0 for t > 96 - R               every run completes R before midnight
  Windows are truncated at t = 0 (k < 0 terms are dropped).

Initial-state / horizon-boundary assumptions (no cross-day state is inferred)
  * Every pump is OFF immediately before slot 0 and has already satisfied its
    min_off_slots, so it may start at slot 0. A pump ON at slot 0 counts as a
    start (it uses one of max_starts_per_day).
  * Every run started within the day must complete min_run_slots before
    midnight, i.e. no start later than slot 96 - min_run_slots.
  * An OFF period between two runs must last min_off_slots. A trailing OFF
    period at the end of the day need not complete (nothing follows it).

Objective
  minimise   sum_t w[t] * pump_kw[t] * 0.25        (weighted energy, w=PEAK_WEIGHT in window)
           + PEAK_DEMAND_WEIGHT * peak_kw           (coincident peak-window demand)
           + START_PENALTY * sum_{p,t} s[p,t]       (wear / cycling)
  The weights are dimensionless modelling knobs, not tariffs. No monetary
  value is computed anywhere in this module.

Status reporting
  "optimal"             CBC proved optimality
  "feasible_timeout"    time limit hit with an integer-feasible, unproven solution
  "infeasible"          no schedule satisfies the hard constraints (proven by CBC,
                        or detected from inconsistent tank bounds before solving)
  "timeout_no_solution" CBC stopped before finding any feasible schedule
  "invalid_input"       the request does not match the contract
  "error"               solver or verification failure
  A schedule is only returned for "optimal" and "feasible_timeout", and only
  after it has been re-simulated and checked against every hard constraint.

Determinism
  CBC runs single-threaded with fixed options and the model is built in input
  order, so identical requests give identical schedules. The one exception is
  the wall-clock time limit: a solve that ends near SOLVER_TIME_LIMIT_S may stop
  at a different point on a slower or busier machine.
"""

from __future__ import annotations

import math
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import pulp

SLOTS = 96
SLOT_MINUTES = 15
SLOT_HOURS = SLOT_MINUTES / 60.0

PEAK_WEIGHT = 10.0
OFF_PEAK_WEIGHT = 1.0
PEAK_DEMAND_WEIGHT = 50.0
START_PENALTY = 5.0

SOLVER_TIME_LIMIT_S = 30
TOL = 1e-6
MAX_PUMPS = 20
MAX_EVENTS = 500

EVENT_FORMAT = """\
`events` is a list (may be empty or omitted). Intervals are half-open
[start, end) in 15-minute slots (slot 0 = 00:00, slot 95 = 23:45) and are
clipped at midnight (boundary 96). Overlapping fire events add up.

Fire:
  {"type": "fire", "start_slot": 64, "end_slot": 72, "extra_m3_per_slot": 40}
Pump outage:
  {"type": "pump_outage", "pump_id": "P1", "start_slot": 24, "end_slot": 48}

Start (one required, precedence in this order):
  "start_slot"  integer 0..95
  "start"       "HH:MM", two-digit, 15-minute aligned
End (one required, precedence in this order):
  "end_slot"         integer > start
  "end"              "HH:MM", may be "24:00"
  "duration_slots"   integer >= 1
  "duration_minutes" integer, multiple of 15
Fire amount (one required, precedence in this order):
  "extra_m3_per_slot"   finite number >= 0, added to demand in every covered slot
  "demand_m3_per_slot"  alias accepted for compatibility
Every recognised field that is present is validated, even when a
higher-precedence field overrides it. Unknown event types are rejected."""


class InvalidRequest(ValueError):
    pass


# --------------------------------------------------------------------------- #
# Input parsing
# --------------------------------------------------------------------------- #

_HHMM = re.compile(r"^(\d{2}):(\d{2})$")


def _time_slot(value: Any, label: str) -> int:
    match = _HHMM.match(value) if isinstance(value, str) else None
    if not match:
        raise InvalidRequest(f"{label} must be 'HH:MM'")
    h, m = int(match.group(1)), int(match.group(2))
    if h > 24 or m > 59 or (h == 24 and m) or m % SLOT_MINUTES:
        raise InvalidRequest(f"{label} {value!r} is out of range or not 15-minute aligned")
    return (h * 60 + m) // SLOT_MINUTES


def _integer(value: Any, label: str, minimum: int = 0, maximum: Optional[int] = None) -> int:
    # type() check rejects bools and floats such as 4.0 or NaN.
    if type(value) is not int or value < minimum or (maximum is not None and value > maximum):
        bound = f" <= {maximum}" if maximum is not None else ""
        raise InvalidRequest(f"{label} must be an integer >= {minimum}{bound}")
    return value


def _finite(value: Any, label: str, minimum: float = 0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidRequest(f"{label} must be a number")
    try:
        value = float(value)
    except OverflowError:
        raise InvalidRequest(f"{label} is too large")
    if not math.isfinite(value) or value < minimum:
        raise InvalidRequest(f"{label} must be finite and >= {minimum:g}")
    return value


def _peak_slots(peak_window: Any) -> List[int]:
    """["HH:MM", "HH:MM"] or {"start_slot", "end_slot"}; start > end wraps midnight,
    start == end is an empty window."""
    if isinstance(peak_window, dict):
        if "start_slot" not in peak_window or "end_slot" not in peak_window:
            raise InvalidRequest("peak_window object needs 'start_slot' and 'end_slot'")
        start = _integer(peak_window["start_slot"], "peak_window.start_slot", 0, SLOTS)
        end = _integer(peak_window["end_slot"], "peak_window.end_slot", 0, SLOTS)
    elif isinstance(peak_window, list) and len(peak_window) == 2:
        start = _time_slot(peak_window[0], "peak_window start")
        end = _time_slot(peak_window[1], "peak_window end")
    else:
        raise InvalidRequest("peak_window must be ['HH:MM', 'HH:MM'] or {start_slot, end_slot}")
    if start <= end:
        return list(range(start, end))
    return list(range(start, SLOTS)) + list(range(0, end))


def _event_slots(event: Dict[str, Any], label: str) -> List[int]:
    parsed: Dict[str, int] = {}
    for key in ("start_slot", "end_slot", "duration_slots", "duration_minutes"):
        if key in event:
            parsed[key] = _integer(event[key], f"{label}.{key}")
    for key in ("start", "end"):
        if key in event:
            parsed[key] = _time_slot(event[key], f"{label}.{key}")
    if parsed.get("duration_minutes", 0) % SLOT_MINUTES:
        raise InvalidRequest(f"{label}.duration_minutes must be a multiple of {SLOT_MINUTES}")

    if "start_slot" in parsed:
        start = parsed["start_slot"]
    elif "start" in parsed:
        start = parsed["start"]
    else:
        raise InvalidRequest(f"{label} needs 'start_slot' or 'start' (HH:MM)")

    if "end_slot" in parsed:
        end = parsed["end_slot"]
    elif "end" in parsed:
        end = parsed["end"]
    elif "duration_slots" in parsed:
        end = start + parsed["duration_slots"]
    elif "duration_minutes" in parsed:
        end = start + parsed["duration_minutes"] // SLOT_MINUTES
    else:
        raise InvalidRequest(
            f"{label} needs one of 'end_slot', 'end', 'duration_slots', 'duration_minutes'"
        )

    if not (0 <= start < SLOTS) or end <= start:
        raise InvalidRequest(f"{label} has an empty or out-of-range time span")
    return list(range(start, min(end, SLOTS)))


def _parse(request: Any) -> Dict[str, Any]:
    if not isinstance(request, dict):
        raise InvalidRequest("request must be a JSON object")
    if not isinstance(request.get("date"), str):
        raise InvalidRequest("'date' must be an ISO date string (YYYY-MM-DD)")
    try:
        date.fromisoformat(request["date"])
    except ValueError:
        raise InvalidRequest(f"'date' {request['date']!r} is not a valid ISO date")
    if "peak_window" not in request:
        raise InvalidRequest("missing 'peak_window'")
    peak = _peak_slots(request["peak_window"])

    system = request.get("system")
    if not isinstance(system, dict):
        raise InvalidRequest("missing 'system' object")
    if type(system.get("slot_minutes")) is not int or system["slot_minutes"] != SLOT_MINUTES:
        raise InvalidRequest(f"system.slot_minutes must be the integer {SLOT_MINUTES}")
    if "base_load_kw" not in system:
        raise InvalidRequest("missing 'system.base_load_kw'")
    base_load = _finite(system["base_load_kw"], "system.base_load_kw")

    demand = system.get("demand_m3_per_slot")
    if not isinstance(demand, list) or len(demand) != SLOTS:
        raise InvalidRequest(f"demand_m3_per_slot must be a list of exactly {SLOTS} numbers")
    demand = [_finite(v, f"demand_m3_per_slot[{i}]") for i, v in enumerate(demand)]

    tank_raw = system.get("tank")
    if not isinstance(tank_raw, dict):
        raise InvalidRequest("missing 'system.tank' object")
    tank = {}
    for key in ("capacity_m3", "initial_m3", "min_operating_m3", "fire_reserve_m3"):
        if key not in tank_raw:
            raise InvalidRequest(f"system.tank missing {key!r}")
        tank[key] = _finite(tank_raw[key], f"system.tank.{key}")
    if not math.isfinite(tank["min_operating_m3"] + tank["fire_reserve_m3"]):
        raise InvalidRequest("min_operating_m3 + fire_reserve_m3 overflows")

    pumps_raw = system.get("pumps")
    if not isinstance(pumps_raw, list):
        raise InvalidRequest("system.pumps must be a list")
    if len(pumps_raw) > MAX_PUMPS:
        raise InvalidRequest(f"at most {MAX_PUMPS} pumps are supported")
    pumps = []
    seen = set()
    for i, p in enumerate(pumps_raw):
        label = f"system.pumps[{i}]"
        if not isinstance(p, dict):
            raise InvalidRequest(f"{label} must be an object")
        missing = [k for k in ("id", "kw", "flow_m3h", "min_run_slots", "min_off_slots",
                               "max_starts_per_day", "available") if k not in p]
        if missing:
            raise InvalidRequest(f"{label} missing {missing}")
        if not isinstance(p["id"], str) or not p["id"] or p["id"] in seen:
            raise InvalidRequest(f"{label}.id must be a unique non-empty string")
        if not isinstance(p["available"], bool):
            raise InvalidRequest(f"{label}.available must be true/false")
        seen.add(p["id"])
        pumps.append({
            "id": p["id"],
            "kw": _finite(p["kw"], f"{label}.kw"),
            "flow_m3h": _finite(p["flow_m3h"], f"{label}.flow_m3h"),
            "min_run_slots": _integer(p["min_run_slots"], f"{label}.min_run_slots", 1),
            "min_off_slots": _integer(p["min_off_slots"], f"{label}.min_off_slots", 1),
            "max_starts_per_day": _integer(p["max_starts_per_day"], f"{label}.max_starts_per_day"),
            "available": p["available"],
        })

    extra = [0.0] * SLOTS
    forced_off: Dict[str, set] = {p["id"]: set() for p in pumps}
    events = request.get("events", [])
    if events is None:
        events = []
    if not isinstance(events, list):
        raise InvalidRequest("events must be a list")
    if len(events) > MAX_EVENTS:
        raise InvalidRequest(f"at most {MAX_EVENTS} events are supported")
    for i, ev in enumerate(events):
        label = f"events[{i}]"
        if not isinstance(ev, dict):
            raise InvalidRequest(f"{label} must be an object")
        kind = ev.get("type")
        if kind == "fire":
            amounts = {k: _finite(ev[k], f"{label}.{k}")
                       for k in ("extra_m3_per_slot", "demand_m3_per_slot") if k in ev}
            if not amounts:
                raise InvalidRequest(f"{label} (fire) needs 'extra_m3_per_slot'")
            amount = amounts.get("extra_m3_per_slot", amounts.get("demand_m3_per_slot"))
            for t in _event_slots(ev, label):
                extra[t] += amount
        elif kind == "pump_outage":
            pid = ev.get("pump_id")
            if not isinstance(pid, str) or pid not in forced_off:
                raise InvalidRequest(f"{label} refers to unknown pump_id {pid!r}")
            forced_off[pid].update(_event_slots(ev, label))
        else:
            raise InvalidRequest(
                f"{label} has unsupported type {kind!r} (expected 'fire' or 'pump_outage')"
            )

    total = [d + e for d, e in zip(demand, extra)]
    if not all(math.isfinite(v) for v in total):
        raise InvalidRequest("demand plus fire events overflows")

    return {
        "peak": peak,
        "pumps": pumps,
        "tank": tank,
        "base_load_kw": base_load,
        "demand": total,
        "fire_extra": extra,
        "forced_off": forced_off,
    }


# --------------------------------------------------------------------------- #
# Verification (independent re-simulation of a candidate schedule)
# --------------------------------------------------------------------------- #

def _simulate(cfg: Dict[str, Any], on: Dict[str, List[int]]) -> List[float]:
    vol = [cfg["tank"]["initial_m3"]]
    for t in range(SLOTS):
        inflow = SLOT_HOURS * sum(p["flow_m3h"] * on[p["id"]][t] for p in cfg["pumps"])
        vol.append(vol[-1] + inflow - cfg["demand"][t])
    return vol


def _pump_problems(p: Dict[str, Any], x: List[int], forced_off: set) -> List[str]:
    pid = p["id"]
    problems = []
    if not p["available"] and any(x):
        problems.append(f"{pid} runs while unavailable")
    if any(x[t] for t in forced_off):
        problems.append(f"{pid} runs during outage")
    starts = [t for t in range(SLOTS) if x[t] and (t == 0 or not x[t - 1])]
    if len(starts) > p["max_starts_per_day"]:
        problems.append(f"{pid} has {len(starts)} starts > {p['max_starts_per_day']}")
    prev_end = None
    for start in starts:
        end = start
        while end < SLOTS and x[end]:
            end += 1
        if end - start < p["min_run_slots"]:
            problems.append(f"{pid} min run violated at slot {start}")
        if prev_end is not None and start - prev_end < p["min_off_slots"]:
            problems.append(f"{pid} min off violated at slot {start}")
        prev_end = end
    return problems


def _verify(cfg: Dict[str, Any], on: Dict[str, List[int]], vol: List[float]) -> List[str]:
    tank = cfg["tank"]
    lo = tank["min_operating_m3"] + tank["fire_reserve_m3"]
    problems: List[str] = []
    if len(vol) != SLOTS + 1:
        problems.append("volume trajectory does not cover all 97 boundaries")
    for t, v in enumerate(vol):
        if v < lo - TOL or v > tank["capacity_m3"] + TOL:
            problems.append(f"tank {v:.3f} m3 out of bounds at boundary {t}")
    if vol[-1] < vol[0] - TOL:
        problems.append("end-of-day volume below initial volume")
    for p in cfg["pumps"]:
        problems.extend(_pump_problems(p, on[p["id"]], cfg["forced_off"][p["id"]]))
    return problems


# --------------------------------------------------------------------------- #
# Optimisation
# --------------------------------------------------------------------------- #

def _empty(status: str, explanation: str) -> Dict[str, Any]:
    return {
        "status": status,
        "schedule": [],
        "coincident_kw_before": None,
        "coincident_kw_after": None,
        "explanation": explanation,
    }


def _build_problem(cfg: Dict[str, Any]) -> Tuple[pulp.LpProblem, Dict[Tuple[str, int], pulp.LpVariable]]:
    pumps = cfg["pumps"]
    tank = cfg["tank"]
    peak = set(cfg["peak"])
    T = range(SLOTS)

    prob = pulp.LpProblem("peakfive_pump_schedule", pulp.LpMinimize)
    # Variable names use pump indices, so arbitrary pump-id strings are safe.
    x = {(p["id"], t): pulp.LpVariable(f"x_{i}_{t}", cat="Binary") for i, p in enumerate(pumps) for t in T}
    s = {(p["id"], t): pulp.LpVariable(f"s_{i}_{t}", cat="Binary") for i, p in enumerate(pumps) for t in T}
    d = {(p["id"], t): pulp.LpVariable(f"d_{i}_{t}", cat="Binary") for i, p in enumerate(pumps) for t in T}
    V = {t: pulp.LpVariable(f"V_{t}",
                            lowBound=tank["min_operating_m3"] + tank["fire_reserve_m3"],
                            upBound=tank["capacity_m3"])
         for t in range(SLOTS + 1)}
    peak_kw = pulp.LpVariable("peak_kw", lowBound=0)

    pump_kw = {t: pulp.lpSum(p["kw"] * x[p["id"], t] for p in pumps) for t in T}

    prob += (
        pulp.lpSum((PEAK_WEIGHT if t in peak else OFF_PEAK_WEIGHT) * SLOT_HOURS * pump_kw[t] for t in T)
        + PEAK_DEMAND_WEIGHT * peak_kw
        + START_PENALTY * pulp.lpSum(s.values())
    )

    prob += V[0] == tank["initial_m3"], "initial_volume"
    for t in T:
        prob += (
            V[t + 1] == V[t]
            + SLOT_HOURS * pulp.lpSum(p["flow_m3h"] * x[p["id"], t] for p in pumps)
            - cfg["demand"][t]
        ), f"mass_balance_{t}"
    prob += V[SLOTS] >= V[0], "end_of_day_volume"

    for t in sorted(peak):
        prob += peak_kw >= pump_kw[t] + cfg["base_load_kw"], f"peak_kw_{t}"

    for i, p in enumerate(pumps):
        pid, run, off = p["id"], p["min_run_slots"], p["min_off_slots"]
        for t in T:
            prev = x[pid, t - 1] if t > 0 else 0  # assumption: OFF before slot 0
            prob += s[pid, t] - d[pid, t] == x[pid, t] - prev, f"transition_{i}_{t}"
            prob += s[pid, t] + d[pid, t] <= 1, f"one_transition_{i}_{t}"
            prob += pulp.lpSum(s[pid, k] for k in range(max(0, t - run + 1), t + 1)) <= x[pid, t], \
                f"min_run_{i}_{t}"
            prob += pulp.lpSum(d[pid, k] for k in range(max(0, t - off + 1), t + 1)) <= 1 - x[pid, t], \
                f"min_off_{i}_{t}"
            if t > SLOTS - run:
                prob += s[pid, t] == 0, f"late_start_{i}_{t}"
            if not p["available"] or t in cfg["forced_off"][pid]:
                prob += x[pid, t] == 0, f"forced_off_{i}_{t}"
        prob += pulp.lpSum(s[pid, t] for t in T) <= p["max_starts_per_day"], f"max_starts_{i}"
    return prob, x


def _classify(status: int, sol_status: int) -> str:
    """Map PuLP/CBC status to a contract status.

    PuLP reports status=Optimal for a CBC run that hit the time limit with an
    incumbent ("Stopped on time - objective value ..."), so proven optimality
    requires sol_status == LpSolutionOptimal too. CBC's "Integer infeasible"
    yields status=Infeasible with sol_status=NoSolutionFound.
    """
    if status == pulp.LpStatusOptimal and sol_status == pulp.LpSolutionOptimal:
        return "optimal"
    if sol_status == pulp.LpSolutionIntegerFeasible:
        return "feasible_timeout"
    if status == pulp.LpStatusInfeasible or sol_status == pulp.LpSolutionInfeasible:
        return "infeasible"
    if status == pulp.LpStatusNotSolved and sol_status == pulp.LpSolutionNoSolutionFound:
        return "timeout_no_solution"
    return "error"


def _solve(cfg: Dict[str, Any], time_limit: int) -> Tuple[str, Optional[Dict[str, List[int]]]]:
    prob, x = _build_problem(cfg)
    # threads=1 keeps CBC's branch-and-bound path deterministic run-to-run.
    prob.solve(pulp.PULP_CBC_CMD(msg=False, timeLimit=time_limit, threads=1))
    outcome = _classify(prob.status, prob.sol_status)
    if outcome not in ("optimal", "feasible_timeout"):
        return outcome, None
    on = {p["id"]: [int(round(x[p["id"], t].value() or 0)) for t in range(SLOTS)] for p in cfg["pumps"]}
    return outcome, on


def optimize(request: Dict[str, Any], time_limit: int = SOLVER_TIME_LIMIT_S) -> Dict[str, Any]:
    try:
        cfg = _parse(request)
    except InvalidRequest as exc:
        return _empty("invalid_input", str(exc))

    tank = cfg["tank"]
    lo = tank["min_operating_m3"] + tank["fire_reserve_m3"]
    if lo > tank["capacity_m3"]:
        return _empty("infeasible",
                      f"min_operating_m3 + fire_reserve_m3 = {lo:g} m3 exceeds capacity "
                      f"{tank['capacity_m3']:g} m3.")
    if not (lo <= tank["initial_m3"] <= tank["capacity_m3"]):
        return _empty("infeasible",
                      f"initial_m3 = {tank['initial_m3']:g} is outside the allowed band "
                      f"[{lo:g}, {tank['capacity_m3']:g}] m3 at boundary 0.")

    try:
        outcome, on = _solve(cfg, time_limit)
    except pulp.PulpSolverError as exc:
        return _empty("error", f"solver failure: {exc}")

    if outcome == "infeasible":
        total_demand = sum(cfg["demand"])
        max_supply = SLOT_HOURS * sum(
            p["flow_m3h"] * (SLOTS - len(cfg["forced_off"][p["id"]]))
            for p in cfg["pumps"] if p["available"]
        )
        return _empty(
            "infeasible",
            "No schedule satisfies all hard constraints (tank bounds incl. fire reserve, "
            "end-of-day volume, availability/outages, min run/off, max starts). "
            f"Total demand incl. fire events: {total_demand:.1f} m3; maximum pump supply "
            f"ignoring cycling limits: {max_supply:.1f} m3.",
        )
    if outcome == "timeout_no_solution":
        return _empty("timeout_no_solution",
                      f"CBC stopped (time limit {time_limit} s) before finding a feasible "
                      "schedule; feasibility is unproven either way.")
    if on is None:
        return _empty("error", "unexpected solver status; no schedule certified.")

    # Volumes are re-simulated from the integer schedule rather than read from
    # the LP, so reported tank_m3 is exact and solver float noise cannot hide a
    # violation.
    vol = _simulate(cfg, on)
    problems = _verify(cfg, on, vol)
    if problems:
        return _empty("error", "Solver output failed constraint verification: " + "; ".join(problems[:5]))

    base = cfg["base_load_kw"]
    kw_by_id = {p["id"]: p["kw"] for p in cfg["pumps"]}
    schedule = []
    for t in range(SLOTS):
        running = [p["id"] for p in cfg["pumps"] if on[p["id"]][t]]
        schedule.append({
            "slot": t,
            "pumps_on": running,
            "kw": base + sum(kw_by_id[pid] for pid in running),
            "tank_m3": vol[t],  # volume at the START of slot t
        })

    peak_slots = cfg["peak"]
    coincident_after = max((schedule[t]["kw"] for t in peak_slots), default=None)
    fire_slots = sum(1 for e in cfg["fire_extra"] if e > 0)
    outage_slots = {pid: len(v) for pid, v in cfg["forced_off"].items() if v}

    notes = [
        ("Proven optimal schedule." if outcome == "optimal"
         else f"Time limit of {time_limit} s reached; schedule is feasible and verified "
              "but optimality is NOT proven."),
        (f"coincident_kw_after = max site kW (pumps + {base:g} kW base load) over the "
         f"{len(peak_slots)} peak-window slots." if peak_slots
         else "Peak window is empty, so coincident_kw_after is null."),
        "coincident_kw_before is null: the request defines no independent baseline "
        "schedule, so no before/after comparison is reported.",
        f"tank_m3 is the volume at the start of each slot; end of day {vol[SLOTS]:.1f} m3 "
        f"vs start {vol[0]:.1f} m3; minimum {min(vol):.1f} m3 over all 97 boundaries "
        f"(floor {lo:g} m3 incl. fire reserve).",
        "Assumes all pumps OFF before 00:00 with min-off satisfied (a run at slot 0 counts "
        "as a start), and every run completes its min run before midnight.",
    ]
    if fire_slots:
        notes.append(f"Fire demand added in {fire_slots} slot(s).")
    if outage_slots:
        notes.append("Outages forced OFF: "
                     + ", ".join(f"{k} ({v} slots)" for k, v in outage_slots.items()) + ".")

    return {
        "status": outcome,
        "schedule": schedule,
        "coincident_kw_before": None,
        "coincident_kw_after": coincident_after,
        "explanation": " ".join(notes),
    }


def illustrative_request() -> Dict[str, Any]:
    """ILLUSTRATIVE pump/tank/demand parameters only - not data from any real
    Ontario municipality or utility. Use for demos and smoke tests."""
    demand = []
    for t in range(SLOTS):
        hour = t * SLOT_HOURS
        # Illustrative diurnal shape: night trough, morning and evening peaks.
        shape = (0.55 + 0.35 * math.exp(-((hour - 7.5) ** 2) / 4)
                 + 0.45 * math.exp(-((hour - 18.5) ** 2) / 5))
        demand.append(round(28 * shape, 3))
    return {
        "date": "2025-07-15",
        "peak_window": ["16:00", "20:00"],
        "system": {
            "slot_minutes": 15,
            "pumps": [
                {"id": "P1", "kw": 80, "flow_m3h": 100, "min_run_slots": 4, "min_off_slots": 4,
                 "max_starts_per_day": 6, "available": True},
                {"id": "P2", "kw": 50, "flow_m3h": 65, "min_run_slots": 4, "min_off_slots": 4,
                 "max_starts_per_day": 6, "available": True},
            ],
            "tank": {"capacity_m3": 1200, "initial_m3": 850,
                     "min_operating_m3": 200, "fire_reserve_m3": 250},
            "base_load_kw": 30,
            "demand_m3_per_slot": demand,
        },
        "events": [],
    }
