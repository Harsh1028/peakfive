"""Baseline vs optimized comparison under identical inputs.

Run: .venv/bin/python -m baseline.compare                 (table, modified policy)
     .venv/bin/python -m baseline.compare --json          (full JSON)
     .venv/bin/python -m baseline.compare --no-recovery   (original proposal, no recovery rule)

Both schedules are validated by the independent checker and measured by the
same schedule_metrics(). Differences are reported ONLY when both schedules pass
the checker; otherwise there is no defensible comparison and none is printed.
Inputs are ILLUSTRATIVE, so any difference is between two models of a
hypothetical system, not a measured or financial saving.
"""

from __future__ import annotations

import copy
import json
import sys
from typing import Any, Dict, Optional

from baseline.hysteresis import (RECOVERY_LABEL, RECOVERY_SETTINGS, HysteresisSettings,
                                 InvalidSettings, check_baseline, schedule_metrics,
                                 simulate_baseline)
from optimizer.checker import check_schedule
from optimizer.model import illustrative_request, optimize


def compare(request: Dict[str, Any],
            settings: HysteresisSettings = RECOVERY_SETTINGS) -> Dict[str, Any]:
    base_req, opt_req = copy.deepcopy(request), copy.deepcopy(request)

    baseline = simulate_baseline(base_req, settings)
    base_check = check_baseline(base_req, baseline)
    out: Dict[str, Any] = {
        "baseline": {
            "label": baseline["label"],
            "settings": baseline["settings"],
            "valid": base_check["valid"],
            "violations": base_check["violations"],
            "metrics": schedule_metrics(base_req, baseline["schedule"]),
            "controller_log": baseline["controller_log"],
        },
    }

    optimized = optimize(opt_req)
    opt_out: Dict[str, Any] = {"status": optimized["status"], "explanation": optimized["explanation"]}
    if optimized["schedule"]:
        opt_check = check_schedule(opt_req, optimized)
        opt_out.update(valid=opt_check["valid"], violations=opt_check["violations"],
                       metrics=schedule_metrics(opt_req, optimized["schedule"]))
    else:
        opt_out.update(valid=False, violations=[f"no schedule (status {optimized['status']})"],
                       metrics=None)
    out["optimized"] = opt_out

    out["comparison"] = _differences(out["baseline"], opt_out)
    if out["comparison"] is None:
        out["comparison_note"] = ("No comparison reported: a schedule failed the independent "
                                  "checker, so a before/after difference would not be defensible.")
    else:
        out["comparison_note"] = ("optimized minus baseline, illustrative inputs; modelled "
                                  "differences, not measured or financial savings.")
        out["energy_note"] = _energy_note(base_req, out["comparison"])
    return out


def _energy_note(request: Dict[str, Any], diff: Dict[str, Any]) -> Optional[str]:
    """Explain how much of the energy difference is just stored water."""
    extra = -diff["end_of_day_m3"]  # > 0: baseline ends with more water
    if abs(extra) < 1e-6:
        return None
    sec = [p["kw"] / p["flow_m3h"] for p in request["system"]["pumps"] if p["flow_m3h"] > 0]
    lo, hi = abs(extra) * min(sec), abs(extra) * max(sec)
    more, fewer = ("baseline", "optimized schedule") if extra > 0 else ("optimized schedule", "baseline")
    return (f"The {more} ends the day with {abs(extra):.2f} m3 more water than the {fewer}, "
            f"which takes about {lo:.1f}-{hi:.1f} kWh to pump at "
            f"{min(sec):.3f}-{max(sec):.3f} kWh/m3. The energy difference "
            f"({diff['pump_energy_kwh']:+.1f} kWh) must not be presented as energy-efficiency savings.")


def _differences(base: Dict[str, Any], opt: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not (base["valid"] and opt["valid"]):
        return None
    b, o = base["metrics"], opt["metrics"]
    # end_of_day_m3 is included because energy differences are only like-for-like
    # when both schedules leave the tank at a similar level.
    diff = {k: o[k] - b[k] for k in ("pump_energy_kwh", "site_energy_kwh", "min_tank_m3",
                                     "end_of_day_m3")}
    if b["peak_window_kw"] is not None and o["peak_window_kw"] is not None:
        diff["peak_window_kw"] = o["peak_window_kw"] - b["peak_window_kw"]
    return diff


# --------------------------------------------------------------------------- #
# POST /compare response body
# --------------------------------------------------------------------------- #

API_LABEL = ("SIMULATED comparison on the submitted inputs: a conventional control policy "
             "(reservoir-level hysteresis with end-of-day recovery, illustrative unvalidated "
             "settings) versus the PEAKFIVE optimizer. Not actual Hamilton utility operations, "
             "not measured data, and not financial savings.")

API_CAVEATS = [
    "Both schedules are simulated from the submitted inputs; nothing here is measured.",
    "The baseline is a simulated conventional control policy with illustrative, unvalidated "
    "settings (lead 650/950 m3, backup 550/650 m3, end-of-day recovery from 20:00 to initial "
    "volume + 25 m3). It does not represent actual Hamilton utility operations.",
    "Peak-window reduction is a difference in modelled site demand (kW) during the peak "
    "window. It is not an energy (kWh) saving and not a financial saving.",
    "Energy (kWh) differences partly reflect different end-of-day reservoir volumes and must "
    "not be presented as energy-efficiency savings.",
    "No tariffs or costs are modelled; no financial figures are produced.",
]


def _comparison_body(status: str, explanation: str, **fields: Any) -> Dict[str, Any]:
    body = {"status": status, "label": API_LABEL, "explanation": explanation,
            "peak_window": None, "energy": None, "baseline": None, "optimized": None,
            "caveats": list(API_CAVEATS)}
    body.update(fields)
    return body


def comparison_error(status: str, explanation: str) -> Dict[str, Any]:
    """Body for /compare responses that carry no schedules (422/500/503)."""
    return _comparison_body(status, explanation)


def comparison_response(request: Dict[str, Any]) -> Dict[str, Any]:
    """Body for POST /compare: baseline vs optimizer on the SAME request.

    Raises optimizer.model.InvalidRequest for malformed input. Every figure is
    computed from this request's schedules; peak-window and energy figures are
    reported only when BOTH schedules pass the independent checker.
    """
    base_req, opt_req = copy.deepcopy(request), copy.deepcopy(request)

    try:
        baseline = simulate_baseline(base_req, RECOVERY_SETTINGS)
    except InvalidSettings as exc:
        base_out: Dict[str, Any] = {
            "label": RECOVERY_LABEL, "applicable": False, "valid": False,
            "violations": [f"baseline policy not applicable to this tank: {exc}"],
            "metrics": None, "schedule": []}
    else:
        check = check_baseline(base_req, baseline)
        base_out = {
            "label": baseline["label"], "applicable": True, "valid": check["valid"],
            "violations": check["violations"],
            "metrics": schedule_metrics(base_req, baseline["schedule"]),
            "schedule": baseline["schedule"]}

    optimized = optimize(opt_req)
    opt_out: Dict[str, Any] = {"status": optimized["status"],
                               "explanation": optimized["explanation"]}
    if optimized["status"] == "invalid_input":
        return comparison_error("invalid_input", optimized["explanation"])
    if optimized["status"] == "error":
        return comparison_error("error", "optimizer error; no comparison: " + optimized["explanation"])
    if optimized["schedule"]:
        check = check_schedule(opt_req, optimized)
        opt_out.update(valid=check["valid"], violations=check["violations"],
                       metrics=schedule_metrics(opt_req, optimized["schedule"]),
                       schedule=optimized["schedule"])
    else:
        opt_out.update(valid=False, violations=[f"no schedule (optimizer status {optimized['status']})"],
                       metrics=None, schedule=[])

    caveats = list(API_CAVEATS)
    if optimized["status"] == "feasible_timeout":
        caveats.append("The optimizer hit its time limit: its schedule is verified feasible "
                       "but NOT proven optimal.")

    if not (base_out["valid"] and opt_out["valid"]):
        reasons = []
        if not base_out["applicable"]:
            reasons.append("the baseline policy's fixed thresholds do not fit this tank")
        elif not base_out["valid"]:
            reasons.append("the baseline schedule failed the independent checker")
        if not opt_out["schedule"]:
            reasons.append(f"the optimizer returned no schedule (status {optimized['status']})")
        elif not opt_out["valid"]:
            reasons.append("the optimized schedule failed the independent checker")
        return _comparison_body(
            "comparison_unavailable",
            "No comparison reported: " + "; ".join(reasons) + ". Reduction figures would not "
            "be defensible. See each schedule's violations.",
            baseline=base_out, optimized=opt_out, caveats=caveats)

    diff = _differences(base_out, opt_out)
    b_kw, o_kw = base_out["metrics"]["peak_window_kw"], opt_out["metrics"]["peak_window_kw"]
    if b_kw is None or o_kw is None:
        peak = {"unit": "kW", "baseline_kw": None, "optimized_kw": None,
                "reduction_kw": None, "reduction_pct": None}
        caveats.append("The peak window is empty, so no peak-window figures exist.")
    else:
        peak = {"unit": "kW", "baseline_kw": b_kw, "optimized_kw": o_kw,
                "reduction_kw": b_kw - o_kw,
                "reduction_pct": (b_kw - o_kw) / b_kw * 100 if b_kw > 0 else None}
    energy = {
        "unit": "kWh",
        "baseline_pump_kwh": base_out["metrics"]["pump_energy_kwh"],
        "optimized_pump_kwh": opt_out["metrics"]["pump_energy_kwh"],
        "optimized_minus_baseline_kwh": diff["pump_energy_kwh"],
        "optimized_minus_baseline_end_of_day_m3": diff["end_of_day_m3"],
        "note": _energy_note(base_req, diff),
    }
    return _comparison_body(
        "comparison_available",
        "Both schedules passed the independent checker. reduction_kw = baseline minus "
        "optimized peak-window site kW (negative means the optimizer is higher).",
        peak_window=peak, energy=energy, baseline=base_out, optimized=opt_out, caveats=caveats)


def _table(result: Dict[str, Any]) -> str:
    b, o = result["baseline"], result["optimized"]
    bm, om = b["metrics"], o["metrics"] or {}

    def fmt(v: Any) -> str:
        if v is None:
            return "-"
        if isinstance(v, dict):
            return ", ".join(f"{k}={n}" for k, n in v.items())
        return f"{v:.1f}" if isinstance(v, float) else str(v)

    rows = [("checker valid", b["valid"], o["valid"])]
    for key, name in [("peak_window_kw", "peak-window site kW"), ("pump_energy_kwh", "pump energy kWh"),
                      ("site_energy_kwh", "site energy kWh (incl. base)"),
                      ("min_tank_m3", "minimum tank m3 (97 boundaries)"),
                      ("end_of_day_m3", "end-of-day tank m3"), ("pump_starts", "pump starts"),
                      ("pump_slots_on", "slots ON")]:
        rows.append((name, bm[key], om.get(key)))
    width = max(len(r[0]) for r in rows)
    lines = [f"Baseline : {b['label']}",
             f"Optimized: status={o['status']}",
             "Inputs   : ILLUSTRATIVE (optimizer.model.illustrative_request), identical for both",
             "",
             f"{'metric':<{width}}  {'baseline':>22}  {'optimized':>22}"]
    lines += [f"{n:<{width}}  {fmt(x):>22}  {fmt(y):>22}" for n, x, y in rows]
    lines += ["", "Baseline checker violations: " + ("; ".join(b["violations"]) or "none"),
              "Optimized checker violations: " + ("; ".join(o["violations"]) or "none"),
              result["comparison_note"]]
    if result["comparison"]:
        lines += [f"  {k}: {v:+.1f}" for k, v in result["comparison"].items()]
        if result.get("energy_note"):
            lines += ["", "Note: " + result["energy_note"]]
    return "\n".join(lines)


def main(argv: Optional[list] = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    settings = HysteresisSettings() if "--no-recovery" in argv else RECOVERY_SETTINGS
    result = compare(illustrative_request(), settings)
    print(json.dumps(result, indent=2) if "--json" in argv else _table(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
