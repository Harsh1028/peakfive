"""Reproducible tests for the conventional hysteresis baseline.

Run: .venv/bin/python -m pytest baseline/tests -v
"""
import json

import pytest

from baseline.compare import compare
from baseline.hysteresis import (RECOVERY_SETTINGS, HysteresisSettings, InvalidSettings,
                                 check_baseline, schedule_metrics, simulate_baseline)
from optimizer.model import InvalidRequest, illustrative_request


def request(initial=850.0, demand=None, p1=None, p2=None, events=None):
    req = illustrative_request()
    system = req['system']
    system['tank']['initial_m3'] = initial
    if demand is not None:
        system['demand_m3_per_slot'] = demand
    pumps = {p['id']: p for p in system['pumps']}
    pumps['P1'].update(p1 or {})
    pumps['P2'].update(p2 or {})
    req['events'] = events or []
    return req


def on(baseline, pid):
    return [pid in row['pumps_on'] for row in baseline['schedule']]


def actions(baseline, pid):
    return [(e['slot'], e['action']) for e in baseline['controller_log'] if e['pump'] == pid]


# --------------------------------------------------------------------------- #
# Illustrative scenario with the proposed settings (pinned outcome)
# --------------------------------------------------------------------------- #

def test_default_settings_are_the_proposed_thresholds():
    assert HysteresisSettings() == HysteresisSettings(650, 950, 550, 650, None, 0.0)
    assert RECOVERY_SETTINGS == HysteresisSettings(650, 950, 550, 650, 80, 25.0)


def test_illustrative_proposed_policy_fails_only_end_of_day_volume():
    req = illustrative_request()
    b = simulate_baseline(req)
    assert check_baseline(req, b) == {'valid': False,
                                      'violations': ['final volume is below initial volume']}
    m = schedule_metrics(req, b['schedule'])
    assert m['end_of_day_m3'] == pytest.approx(656.706)
    assert m['min_tank_m3'] == pytest.approx(548.607)
    assert m['peak_window_kw'] == 160
    assert m['pump_energy_kwh'] == pytest.approx(1257.5)
    assert m['pump_starts'] == {'P1': 2, 'P2': 1}
    assert [s for s, a in actions(b, 'P2') if a.startswith('start (lead')] == [13]
    assert [s for s, a in actions(b, 'P1') if a.startswith('start (lag')] == [37, 78]


def test_baseline_is_labelled_as_simulation_without_solver_status():
    req = illustrative_request()
    b = simulate_baseline(req)
    assert 'status' not in b
    assert b['mode'] == 'simulated_conventional_operation'
    assert 'Not an optimized solution' in b['label']
    out = compare(req, HysteresisSettings())
    assert 'status' not in out['baseline']
    assert out['comparison'] is None  # baseline invalid -> no before/after figures


def test_deterministic():
    req = illustrative_request()
    first = json.dumps(simulate_baseline(req), sort_keys=True)
    assert all(json.dumps(simulate_baseline(illustrative_request()), sort_keys=True) == first
               for _ in range(3))


def test_input_is_not_mutated():
    req = illustrative_request()
    before = json.dumps(req, sort_keys=True)
    simulate_baseline(req)
    compare(req)
    assert json.dumps(req, sort_keys=True) == before


def test_invalid_request_raises():
    req = illustrative_request()
    req['system']['demand_m3_per_slot'] = [1.0] * 95
    with pytest.raises(InvalidRequest):
        simulate_baseline(req)


# --------------------------------------------------------------------------- #
# Thresholds and equipment rules on small synthetic profiles
# --------------------------------------------------------------------------- #

def test_lead_starts_at_threshold_and_ignores_peak_window():
    # 10 m3/slot drain from 700: V[5] = 650 is the first boundary <= 650.
    req = request(initial=700, demand=[10.0] * 96, p1={'available': False})
    b = simulate_baseline(req)
    assert on(b, 'P2')[:6] == [False] * 5 + [True]
    req['peak_window'] = ['00:00', '06:00']  # starting inside the peak window changes nothing
    assert simulate_baseline(req)['schedule'] == b['schedule']


def test_stop_is_held_until_min_run():
    req = request(initial=640, demand=[0.0] * 96, p1={'available': False})
    b = simulate_baseline(req, HysteresisSettings(lead_start_m3=650, lead_stop_m3=660))
    # Wants to stop at slot 2 (V = 672.5 >= 660) but min_run_slots = 4.
    assert on(b, 'P2')[:5] == [True] * 4 + [False]
    assert (2, 'stop held: min_run_slots (4) not reached') in actions(b, 'P2')
    assert check_baseline(req, b)['valid']


def test_min_off_blocks_restart():
    demand = [0.0] * 4 + [40.0] * 92
    req = request(initial=640, demand=demand, p1={'available': False})
    b = simulate_baseline(req, HysteresisSettings(lead_start_m3=650, lead_stop_m3=660))
    acts = dict(actions(b, 'P2'))
    assert acts[4].startswith('stop')
    assert 'min_off_slots (4) not elapsed' in acts[6]
    assert acts[8].startswith('start')
    assert not any('minimum OFF' in v for v in check_baseline(req, b)['violations'])


def test_max_starts_blocks_further_starts():
    demand = [0.0] * 4 + [40.0] * 92
    req = request(initial=640, demand=demand, p1={'available': False},
                  p2={'max_starts_per_day': 1})
    b = simulate_baseline(req, HysteresisSettings(lead_start_m3=650, lead_stop_m3=660))
    assert schedule_metrics(req, b['schedule'])['pump_starts']['P2'] == 1
    assert any('max_starts_per_day (1) used' in a for _, a in actions(b, 'P2'))
    assert not any('start limit' in v for v in check_baseline(req, b)['violations'])


def test_no_late_start_that_cannot_finish_min_run_before_midnight():
    demand = [0.0] * 92 + [60.0] + [0.0] * 3  # V[93] = 640 <= 650
    req = request(initial=700, demand=demand, p1={'available': False})
    b = simulate_baseline(req)
    assert not any(on(b, 'P2'))
    assert (93, 'start blocked (lead, V=640.0): min_run_slots (4) cannot complete '
                'before midnight') in actions(b, 'P2')
    assert not any('minimum ON' in v for v in check_baseline(req, b)['violations'])


def test_p1_takes_lead_role_when_p2_unavailable():
    req = request(p2={'available': False})
    b = simulate_baseline(req)
    assert not any(on(b, 'P2'))
    first = actions(b, 'P1')[0]
    assert first[1].startswith('start (lead') and b['schedule'][first[0]]['tank_m3'] <= 650
    assert b['schedule'][first[0] - 1]['tank_m3'] > 650
    assert not any('unavailable' in v for v in check_baseline(req, b)['violations'])


def test_outage_respected_and_p1_leads_during_it():
    req = request(events=[{'type': 'pump_outage', 'pump_id': 'P2', 'start_slot': 20, 'end_slot': 40}])
    b = simulate_baseline(req)
    assert not any(on(b, 'P2')[20:40])
    acts = actions(b, 'P2')
    assert (20, 'forced off (unavailable or outage)') in acts
    assert any(a.startswith('start (lead') for _, a in actions(b, 'P1'))
    assert not any('outage' in v for v in check_baseline(req, b)['violations'])


def test_no_start_whose_min_run_would_overlap_outage():
    req = request(initial=700, demand=[10.0] * 96, p1={'available': False},
                  events=[{'type': 'pump_outage', 'pump_id': 'P2', 'start_slot': 7, 'end_slot': 30}])
    b = simulate_baseline(req)
    assert (5, 'start blocked (lead, V=650.0): min_run_slots (4) would overlap a '
               'scheduled outage') in actions(b, 'P2')
    assert not any(on(b, 'P2')[:7])


# --------------------------------------------------------------------------- #
# Checker reuse and comparison gating
# --------------------------------------------------------------------------- #

def test_checker_catches_tampered_baseline():
    req = illustrative_request()
    b = simulate_baseline(req)
    b['schedule'][10]['pumps_on'] = ['P1']
    violations = check_baseline(req, b)['violations']
    assert any('incorrect electricity load' in v for v in violations)
    assert any('incorrect tank mass balance' in v for v in violations)


def test_comparison_reported_only_when_both_schedules_valid():
    out = compare(illustrative_request())  # default: modified policy with recovery
    assert out['baseline']['valid'] and out['optimized']['valid']
    assert set(out['comparison']) == {'pump_energy_kwh', 'site_energy_kwh', 'min_tank_m3',
                                      'end_of_day_m3', 'peak_window_kw'}
    b, o = out['baseline']['metrics'], out['optimized']['metrics']
    assert out['comparison']['peak_window_kw'] == o['peak_window_kw'] - b['peak_window_kw']
    assert 'not measured or financial savings' in out['comparison_note']


def test_comparison_withheld_when_optimizer_has_no_schedule():
    req = illustrative_request()
    req['system']['pumps'][0]['available'] = False  # P2 alone cannot meet demand
    out = compare(req)
    assert out['optimized']['status'] == 'infeasible'
    assert out['comparison'] is None


# --------------------------------------------------------------------------- #
# End-of-day recovery rule (modified conventional policy)
# --------------------------------------------------------------------------- #

def test_recovery_policy_passes_checker_on_illustrative_scenario():
    req = illustrative_request()
    b = simulate_baseline(req, RECOVERY_SETTINGS)
    assert check_baseline(req, b) == {'valid': True, 'violations': []}
    assert b['mode'] == 'simulated_modified_conventional_operation'
    assert 'end-of-day recovery' in b['label'] and 'Not an optimized solution' in b['label']
    m = schedule_metrics(req, b['schedule'])
    assert m['end_of_day_m3'] == pytest.approx(881.706)
    assert m['min_tank_m3'] == pytest.approx(548.607)
    assert m['peak_window_kw'] == 160
    assert m['pump_energy_kwh'] == pytest.approx(1437.5)
    assert m['pump_starts'] == {'P1': 2, 'P2': 1}
    assert (93, 'stop (lag recovery, V=879.4 >= 875)') in actions(b, 'P1')


def test_recovery_leaves_hysteresis_unchanged_before_window():
    req = illustrative_request()
    plain = simulate_baseline(req)['schedule']
    recovered = simulate_baseline(req, RECOVERY_SETTINGS)['schedule']
    assert recovered[:80] == plain[:80]


@pytest.mark.parametrize('start', [64, 68, 72, 76, 80, 84, 88])
@pytest.mark.parametrize('margin', [0.0, 25.0, 50.0])
def test_recovery_result_is_not_sensitive_to_start_or_margin(start, margin):
    req = illustrative_request()
    b = simulate_baseline(req, HysteresisSettings(recovery_start_slot=start, recovery_margin_m3=margin))
    assert check_baseline(req, b)['valid']


def test_recovery_starting_at_23h_is_too_late():
    req = illustrative_request()
    b = simulate_baseline(req, HysteresisSettings(recovery_start_slot=92, recovery_margin_m3=25.0))
    assert check_baseline(req, b)['violations'] == ['final volume is below initial volume']


@pytest.mark.parametrize('events', [
    [{'type': 'fire', 'start': '17:00', 'end': '19:00', 'extra_m3_per_slot': 30}],
    [{'type': 'pump_outage', 'pump_id': 'P2', 'start': '05:00', 'end': '07:00'}],
])
def test_recovery_passes_with_fire_or_short_outage(events):
    req = request(events=events)
    assert check_baseline(req, simulate_baseline(req, RECOVERY_SETTINGS))['valid']


@pytest.mark.parametrize('p2,events', [
    ({'available': False}, []),
    (None, [{'type': 'pump_outage', 'pump_id': 'P1', 'start': '20:00', 'end': '24:00'}]),
])
def test_recovery_known_limit_reported_not_hidden(p2, events):
    # Without a demand forecast the 20:00 recovery cannot always catch up,
    # although the optimizer finds feasible schedules for both cases.
    req = request(p2=p2, events=events)
    assert check_baseline(req, simulate_baseline(req, RECOVERY_SETTINGS))['violations'] == [
        'final volume is below initial volume']


# --------------------------------------------------------------------------- #
# Settings validation (regression)
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize('field', ['lead_start_m3', 'lead_stop_m3', 'lag_start_m3', 'lag_stop_m3',
                                   'recovery_margin_m3'])
@pytest.mark.parametrize('bad', [float('nan'), float('inf'), float('-inf'), -1.0, '650', None, True])
def test_settings_reject_nonfinite_negative_and_non_numeric(field, bad):
    with pytest.raises(InvalidSettings):
        HysteresisSettings(**{field: bad})


@pytest.mark.parametrize('kwargs', [
    {'lead_start_m3': 950.0},                       # start == stop
    {'lead_start_m3': 960.0},                       # start > stop
    {'lag_start_m3': 650.0},                        # lag start == lag stop
    {'lag_start_m3': 700.0, 'lag_stop_m3': 800.0},  # backup starts above lead start
    {'lag_stop_m3': 1000.0},                        # backup stops above lead stop
])
def test_settings_reject_inconsistent_thresholds(kwargs):
    with pytest.raises(InvalidSettings):
        HysteresisSettings(**kwargs)


@pytest.mark.parametrize('slot', [-1, 96, 100, 80.0, '20:00', True, float('nan')])
def test_settings_reject_invalid_recovery_time(slot):
    with pytest.raises(InvalidSettings):
        HysteresisSettings(recovery_start_slot=slot)


@pytest.mark.parametrize('kwargs', [
    {'lag_start_m3': 400.0},                                   # below 450 m3 floor
    {'lead_stop_m3': 1250.0},                                  # above 1200 m3 capacity
    {'recovery_start_slot': 80, 'recovery_margin_m3': 400.0},  # target 1250 > capacity
])
def test_settings_reject_values_outside_tank(kwargs):
    with pytest.raises(InvalidSettings):
        simulate_baseline(illustrative_request(), HysteresisSettings(**kwargs))


def test_settings_must_be_settings_object():
    with pytest.raises(InvalidSettings):
        simulate_baseline(illustrative_request(), {'lead_start_m3': 650})


def test_valid_edge_settings_accepted():
    HysteresisSettings(recovery_start_slot=0)
    HysteresisSettings(recovery_start_slot=95, recovery_margin_m3=0)
    HysteresisSettings(lag_start_m3=650.0, lag_stop_m3=950.0)  # lag may equal lead thresholds


# --------------------------------------------------------------------------- #
# Energy caveat in the comparison output
# --------------------------------------------------------------------------- #

def test_energy_note_explains_stored_water_difference():
    out = compare(illustrative_request())
    assert out['comparison']['end_of_day_m3'] == pytest.approx(-31.25)
    note = out['energy_note']
    assert 'baseline ends the day with 31.25 m3 more water' in note
    assert 'must not be presented as energy-efficiency savings' in note


def test_cli_prints_energy_note(capsys):
    from baseline.compare import main
    assert main([]) == 0
    printed = capsys.readouterr().out
    assert '31.25 m3 more water' in printed
    assert 'must not be presented as energy-efficiency savings' in printed
