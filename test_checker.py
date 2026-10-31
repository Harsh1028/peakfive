"""Adversarial tests construct schedules without using optimizer logic."""
from copy import deepcopy
import importlib

import pytest

from optimizer.checker import check_schedule


def case():
    request = {
        'date': '2026-10-30', 'peak_window': {'start_slot': 64, 'end_slot': 80},
        'system': {
            'slot_minutes': 15, 'base_load_kw': 10,
            'pumps': [{'id': 'P1', 'kw': 100, 'flow_m3h': 40,
                       'min_run_slots': 2, 'min_off_slots': 2,
                       'max_starts_per_day': 10, 'available': True}],
            'tank': {'capacity_m3': 2000, 'initial_m3': 500,
                     'min_operating_m3': 100, 'fire_reserve_m3': 100},
            'demand_m3_per_slot': [10] * 96}, 'events': []}
    result = {'status': 'optimal', 'schedule': [
        {'slot': t, 'pumps_on': ['P1'], 'kw': 110, 'tank_m3': 500}
        for t in range(96)], 'coincident_kw_before': None,
        'coincident_kw_after': 110, 'explanation': 'fixture'}
    return request, result


def recalculate(request, result):
    """Fixture helper; each slot delivers 10 m3 for P1."""
    volume = request['system']['tank']['initial_m3']
    for row in result['schedule']:
        row['tank_m3'] = volume
        volume += (10 if row['pumps_on'] else 0) - request['system']['demand_m3_per_slot'][row['slot']]
        row['kw'] = 110 if row['pumps_on'] else 10


def rejects(request, result, phrase):
    checked = check_schedule(request, result)
    assert checked['valid'] is False
    assert any(phrase in v for v in checked['violations']), checked


def test_valid_and_no_mutation():
    request, result = case()
    original = deepcopy((request, result))
    assert check_schedule(request, result) == {'valid': True, 'violations': []}
    assert (request, result) == original


def test_initial_boundary_fire_reserve():
    request, result = case()
    request['system']['tank']['initial_m3'] = 199
    recalculate(request, result)
    rejects(request, result, 'boundary 0: tank below')


def test_final_boundary_overflow():
    request, result = case()
    request['system']['demand_m3_per_slot'][-1] = 0
    request['system']['tank']['capacity_m3'] = 505
    recalculate(request, result)
    rejects(request, result, 'boundary 96: tank capacity')


def test_mass_balance_last_reported_boundary():
    request, result = case()
    result['schedule'][-1]['tank_m3'] += 1
    rejects(request, result, 'slot 95: incorrect tank mass balance')


def test_fabricated_volumes_cannot_hide_reserve_violation():
    request, result = case()
    request['system']['demand_m3_per_slot'][0] = 400
    rejects(request, result, 'boundary 1: tank below')


def test_electricity():
    request, result = case()
    result['schedule'][3]['kw'] = 100
    rejects(request, result, 'incorrect electricity load')


def test_unavailable():
    request, result = case()
    request['system']['pumps'][0]['available'] = False
    rejects(request, result, 'unavailable pump')


def test_start_limit_counts_initial_start():
    request, result = case()
    request['system']['pumps'][0]['max_starts_per_day'] = 0
    rejects(request, result, 'pump-start limit')


@pytest.mark.parametrize('off_slots, phrase', [([1, 2], 'minimum ON'), ([2], 'minimum OFF'), ([94], 'minimum ON')])
def test_minimum_durations(off_slots, phrase):
    request, result = case()
    request['system']['demand_m3_per_slot'] = [0] * 96
    for t in off_slots:
        result['schedule'][t]['pumps_on'] = []
    recalculate(request, result)
    rejects(request, result, phrase)


def test_fire_demand_cannot_be_ignored():
    request, result = case()
    request['events'] = [{'type': 'fire', 'start_slot': 10, 'end_slot': 12, 'demand_m3_per_slot': 200}]
    rejects(request, result, 'boundary 12: tank below')
    rejects(request, result, 'incorrect tank mass balance')


def test_fire_interval_is_half_open_and_additive():
    request, result = case()
    request['system']['demand_m3_per_slot'] = [0] * 96
    request['events'] = [
        {'type': 'fire', 'start_slot': 10, 'end_slot': 12, 'demand_m3_per_slot': 1},
        {'type': 'fire', 'start_slot': 11, 'end_slot': 12, 'demand_m3_per_slot': 2}]
    recalculate(request, result)
    for row in result['schedule']:
        row['tank_m3'] -= (1 if row['slot'] == 11 else 4 if row['slot'] >= 12 else 0)
    assert check_schedule(request, result)['valid']


def test_outage():
    request, result = case()
    request['events'] = [{'type': 'pump_outage', 'start_slot': 10, 'end_slot': 11, 'pump_id': 'P1'}]
    rejects(request, result, 'pump outage violated')


@pytest.mark.parametrize('change', ['missing', 'order', 'unknown', 'duplicate'])
def test_slots_and_ids(change):
    request, result = case()
    if change == 'missing':
        result['schedule'].pop()
    elif change == 'order':
        result['schedule'][1]['slot'] = 0
    else:
        result['schedule'][0]['pumps_on'] = ['missing'] if change == 'unknown' else ['P1', 'P1']
    assert not check_schedule(request, result)['valid']


@pytest.mark.parametrize('value', [float('nan'), float('inf'), -float('inf'), True, '10', None])
@pytest.mark.parametrize('location', ['demand', 'flow', 'volume', 'kw', 'metric'])
def test_invalid_numbers(value, location):
    request, result = case()
    if location == 'demand':
        request['system']['demand_m3_per_slot'][0] = value
    elif location == 'flow':
        request['system']['pumps'][0]['flow_m3h'] = value
    elif location == 'metric':
        result['coincident_kw_after'] = value
    else:
        result['schedule'][0]['tank_m3' if location == 'volume' else 'kw'] = value
    assert not check_schedule(request, result)['valid']


def test_end_of_day():
    request, result = case()
    request['system']['demand_m3_per_slot'][-1] = 11
    recalculate(request, result)
    rejects(request, result, 'final volume is below initial')


def test_infeasible_optimizer_response():
    request, _ = case()
    rejects(request, {'status': 'infeasible'}, 'not optimal')


@pytest.mark.parametrize('req,res', [(None, {}), ({}, {}), ([], []), ({'date': 'bad'}, {} )])
def test_malformed_objects(req, res):
    assert not check_schedule(req, res)['valid']


def test_missing_required_value():
    request, result = case()
    del result['schedule'][0]['kw']
    rejects(request, result, 'malformed')


def test_tolerance_is_absolute():
    request, result = case()
    result['schedule'][0]['tank_m3'] += 0.5e-6
    result['schedule'][0]['kw'] += 0.5e-6
    assert check_schedule(request, result)['valid']
    result['schedule'][0]['kw'] += 2e-6
    rejects(request, result, 'electricity')


@pytest.mark.parametrize('change', ['demand_length', 'duplicate_pump', 'slot_minutes', 'bad_event', 'bad_interval', 'missing_pump_field'])
def test_malformed_requests(change):
    request, result = case()
    if change == 'demand_length':
        request['system']['demand_m3_per_slot'].pop()
    elif change == 'duplicate_pump':
        request['system']['pumps'].append(deepcopy(request['system']['pumps'][0]))
    elif change == 'slot_minutes':
        request['system']['slot_minutes'] = 30
    elif change == 'bad_event':
        request['events'] = [{'type': 'unknown', 'start_slot': 0, 'end_slot': 1}]
    elif change == 'bad_interval':
        request['peak_window']['end_slot'] = 97
    else:
        del request['system']['pumps'][0]['min_run_slots']
    rejects(request, result, 'malformed')


@pytest.mark.parametrize('scenario', ['baseline', 'fire', 'outage'])
def test_optimizer_integration(scenario):
    model = importlib.import_module('optimizer.model')
    optimize = getattr(model, 'optimize', None)
    if optimize is None:
        pytest.skip('optimizer.model.optimize is not implemented yet')
    request, _ = case()
    # Baseline mass balance forces P1 on in all 96 slots to restore initial.
    if scenario != 'baseline':
        request['system']['demand_m3_per_slot'] = [5] * 96
    if scenario == 'fire':
        request['events'] = [{'type': 'fire', 'start_slot': 20, 'end_slot': 24,
                              'demand_m3_per_slot': 20}]
    elif scenario == 'outage':
        request['events'] = [{'type': 'pump_outage', 'start_slot': 20,
                              'end_slot': 24, 'pump_id': 'P1'}]
    result = optimize(request)
    checked = check_schedule(request, result)
    assert checked['valid'], checked['violations']


def test_outage_end_boundary_is_exclusive():
    req, res = case()
    req['system']['demand_m3_per_slot'] = [0] * 96
    req['events'] = [{'type': 'pump_outage', 'start_slot': 0, 'end_slot': 2, 'pump_id': 'P1'}]
    res['schedule'][0]['pumps_on'] = []
    res['schedule'][1]['pumps_on'] = []
    recalculate(req, res)
    assert check_schedule(req, res)['valid']


def test_initial_overflow_even_if_first_slot_drains():
    req, res = case()
    req['system']['tank']['capacity_m3'] = 499
    req['system']['demand_m3_per_slot'][0] = 11
    recalculate(req, res)
    rejects(req, res, 'boundary 0: tank capacity')


def test_empty_pumps_can_be_feasible():
    req, res = case()
    req['system']['pumps'] = []
    req['system']['demand_m3_per_slot'] = [0] * 96
    for row in res['schedule']:
        row['pumps_on'] = []
        row['kw'] = 10
    res['coincident_kw_after'] = 10
    assert check_schedule(req, res)['valid']


def test_multiple_pumps_have_independent_load_and_flow():
    req, res = case()
    pump = deepcopy(req['system']['pumps'][0])
    pump.update(id='P2', kw=7, flow_m3h=4)
    req['system']['pumps'].append(pump)
    for row in res['schedule']:
        row['pumps_on'].append('P2')
        row['kw'] = 117
        row['tank_m3'] = 500 + row['slot']
    res['coincident_kw_after'] = 117
    assert check_schedule(req, res)['valid']


def test_start_of_slot_convention_with_changing_volume():
    req, res = case()
    req['system']['demand_m3_per_slot'] = [5] * 96
    recalculate(req, res)
    assert res['schedule'][0]['tank_m3'] == 500
    assert res['schedule'][95]['tank_m3'] == 975
    assert check_schedule(req, res)['valid']
    for row in res['schedule']:
        row['tank_m3'] += 5  # an end-of-slot schedule must now be rejected
    rejects(req, res, 'slot 0: incorrect tank mass balance')


def test_final_unreported_boundary_reserve():
    req, res = case()
    req['system']['demand_m3_per_slot'][-1] = 311
    recalculate(req, res)
    assert res['schedule'][-1]['tank_m3'] == 500
    rejects(req, res, 'boundary 96: tank below')


def test_feasible_timeout_is_checked_normally():
    req, res = case()
    res['status'] = 'feasible_timeout'
    assert check_schedule(req, res)['valid']
    res['schedule'][0]['kw'] = 0
    rejects(req, res, 'incorrect electricity load')


@pytest.mark.parametrize('span', [
    {'start': '05:01', 'end': '06:00'},
    {'start': '24:00', 'duration_slots': 1},
    {'start_slot': True, 'end_slot': 3},
    {'start_slot': 1, 'duration_minutes': 16},
    {'start_slot': 1, 'duration_slots': -1},
    {'start_slot': 1, 'end_slot': 1},
    {'start_slot': 1, 'end_slot': float('inf')},
    {'start_slot': 1, 'duration_slots': float('nan')},
    {'start_slot': 1},
    {'end_slot': 2},
    # Lower-precedence aliases still cannot conceal malformed numeric values.
    {'start_slot': 1, 'end_slot': 2, 'duration_minutes': float('nan')},
])
def test_invalid_event_spans(span):
    req, res = case()
    req['events'] = [dict(span, type='fire', extra_m3_per_slot=1)]
    rejects(req, res, 'malformed')


@pytest.mark.parametrize('extra', [float('nan'), float('inf'), -1, True, None])
def test_invalid_fire_amount(extra):
    req, res = case()
    req['events'] = [{'type': 'fire', 'start_slot': 0, 'end_slot': 1,
                      'extra_m3_per_slot': extra}]
    rejects(req, res, 'malformed')


def test_fire_alias_precedence_is_explicit():
    req, res = case()
    req['events'] = [{'type': 'fire', 'start_slot': 0, 'end_slot': 1,
                      'extra_m3_per_slot': 0, 'demand_m3_per_slot': 100}]
    assert check_schedule(req, res)['valid']


@pytest.mark.parametrize('status', ['optimal', 'feasible_timeout'])
@pytest.mark.parametrize('metric', [0, 10, 100, 109, 111, None, float('nan'), float('inf'), -float('inf'), True, '110'])
def test_falsified_peak_metric(status, metric):
    req, res = case()
    res['status'] = status
    res['coincident_kw_after'] = metric
    rejects(req, res, 'coincident_kw_after')


def test_missing_peak_metric():
    req, res = case()
    del res['coincident_kw_after']
    rejects(req, res, 'coincident_kw_after')


def test_peak_uses_pump_states_even_when_reported_loads_agree_with_forgery():
    req, res = case()
    for row in res['schedule']:
        row['kw'] = 10
    res['coincident_kw_after'] = 10
    rejects(req, res, 'coincident_kw_after: incorrect peak load')
    rejects(req, res, 'incorrect electricity load')


@pytest.mark.parametrize('peak', [
    {'start_slot': 64, 'end_slot': 80}, ['16:00', '20:00'],
    {'start_slot': 80, 'end_slot': 64}, ['20:00', '16:00'],
])
def test_peak_excludes_loads_outside_half_open_window(peak):
    req, res = case()
    req['peak_window'] = peak
    req['system']['demand_m3_per_slot'] = [0] * 96
    # A second zero-flow pump adds 7 kW without changing reservoir feasibility.
    pump = deepcopy(req['system']['pumps'][0])
    pump.update(id='P2', kw=7, flow_m3h=0)
    req['system']['pumps'].append(pump)
    recalculate(req, res)
    wrapped = peak[0] == '20:00' if isinstance(peak, list) else peak['start_slot'] == 80
    # For each interval, place a run exactly at its exclusive end.
    end = 64 if wrapped else 80
    for t in (end, end + 1):
        res['schedule'][t]['pumps_on'].append('P2')
        res['schedule'][t]['kw'] += 7
    assert check_schedule(req, res)['valid']
    res['coincident_kw_after'] = 117
    rejects(req, res, 'coincident_kw_after: incorrect peak load')


def test_peak_includes_extra_pump_at_start_and_uses_maximum():
    req, res = case()
    req['system']['demand_m3_per_slot'] = [0] * 96
    pump = deepcopy(req['system']['pumps'][0])
    pump.update(id='P2', kw=7, flow_m3h=0)
    req['system']['pumps'].append(pump)
    recalculate(req, res)
    for t in (64, 65):
        res['schedule'][t]['pumps_on'].append('P2')
        res['schedule'][t]['kw'] += 7
    res['coincident_kw_after'] = 117
    assert check_schedule(req, res)['valid']
    res['coincident_kw_after'] = 110.875  # mean of the 16 peak slots
    rejects(req, res, 'coincident_kw_after: incorrect peak load')


def test_peak_metric_absolute_tolerance():
    req, res = case()
    res['coincident_kw_after'] += 0.5e-6
    assert check_schedule(req, res)['valid']
    res['coincident_kw_after'] += 2e-6
    rejects(req, res, 'coincident_kw_after: incorrect peak load')


@pytest.mark.parametrize('metric', [0, 110, float('nan'), float('inf')])
def test_empty_peak_window_requires_null(metric):
    req, res = case()
    req['peak_window'] = ['00:00', '00:00']
    res['coincident_kw_after'] = None
    assert check_schedule(req, res)['valid']
    res['coincident_kw_after'] = metric
    rejects(req, res, 'coincident_kw_after')
