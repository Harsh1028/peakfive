"""Real solver acceptance tests; no optimizer parser/simulator is used by checker.

Run: .venv/bin/python -m pytest optimizer/tests/test_integration.py -v
"""
from copy import deepcopy

import pytest

from optimizer.checker import check_schedule
from optimizer.model import optimize
from optimizer.tests.test_checker import case


def scenario(name):
    req, _ = case()
    system = req['system']
    pump = system['pumps'][0]
    system['demand_m3_per_slot'] = [5] * 96
    if name == 'fire_emergency':
        req['events'] = [{'type': 'fire', 'start': '05:00', 'duration_minutes': 60,
                          'extra_m3_per_slot': 15}]
    elif name == 'pump_outage':
        req['events'] = [{'type': 'pump_outage', 'pump_id': 'P1',
                          'start': '05:00', 'end': '07:00'}]
    elif name == 'impossible_demand':
        system['demand_m3_per_slot'] = [11] * 96
    elif name == 'unavailable_pump':
        other = deepcopy(pump)
        other['id'] = 'P2'
        system['pumps'].append(other)
        pump['available'] = False
    elif name == 'all_unavailable':
        pump['available'] = False
    elif name == 'minimum_run_off':
        # With only 20 m3 usable storage, 2-ON/2-OFF cycles are feasible.
        system['tank'].update(capacity_m3=220, initial_m3=210)
        pump.update(min_run_slots=2, min_off_slots=2, max_starts_per_day=24)
    elif name == 'maximum_starts':
        pump['max_starts_per_day'] = 1
    elif name == 'zero_starts':
        pump['max_starts_per_day'] = 0
    elif name == 'capacity_fire_reserve':
        # Tight band forces alternating slots, touching capacity and reserve floor.
        system['tank'].update(capacity_m3=210, initial_m3=205)
        pump.update(min_run_slots=1, min_off_slots=1, max_starts_per_day=48)
    elif name == 'final_volume':
        # No space for pumping until the final slot. V[95] alone cannot prove V[96].
        system['tank']['capacity_m3'] = 500
        system['demand_m3_per_slot'] = [0] * 95 + [10]
        pump.update(min_run_slots=1, min_off_slots=1, max_starts_per_day=1)
    elif name == 'reserve_impossible':
        system['tank'].update(capacity_m3=199)
    elif name == 'normal_day':
        pass
    else:
        raise AssertionError(name)
    return req


@pytest.mark.parametrize('name,feasible', [
    ('normal_day', True), ('fire_emergency', True), ('pump_outage', True),
    ('impossible_demand', False), ('unavailable_pump', True), ('all_unavailable', False),
    ('minimum_run_off', True), ('maximum_starts', True), ('zero_starts', False),
    ('capacity_fire_reserve', True), ('final_volume', True), ('reserve_impossible', False),
])
def test_optimizer_acceptance(name, feasible):
    req = scenario(name)
    result = optimize(req)
    if feasible:
        assert result['status'] in ('optimal', 'feasible_timeout'), result
        assert check_schedule(req, result) == {'valid': True, 'violations': []}, result
    else:
        assert result['status'] == 'infeasible', result
        assert result['schedule'] == []
        assert not check_schedule(req, result)['valid']


@pytest.mark.parametrize('span', [
    {'start_slot': 20, 'end_slot': 24},
    {'start': '05:00', 'end': '06:00'},
    {'start_slot': 20, 'duration_slots': 4},
    {'start': '05:00', 'duration_minutes': 60},
    {'start_slot': 95, 'duration_slots': 4},  # optimizer clips past midnight
])
@pytest.mark.parametrize('kind', ['fire', 'pump_outage'])
def test_documented_event_formats(span, kind):
    req = scenario('normal_day')
    event = dict(span, type=kind)
    event.update({'extra_m3_per_slot': 1.25} if kind == 'fire' else {'pump_id': 'P1'})
    req['events'] = [event]
    result = optimize(req)
    assert result['status'] in ('optimal', 'feasible_timeout'), result
    assert check_schedule(req, result) == {'valid': True, 'violations': []}


@pytest.mark.parametrize('peak', [['16:00', '20:00'], ['22:00', '02:00'], ['00:00', '00:00']])
def test_documented_peak_formats(peak):
    req = scenario('normal_day')
    req['peak_window'] = peak
    result = optimize(req)
    assert result['status'] in ('optimal', 'feasible_timeout'), result
    assert check_schedule(req, result) == {'valid': True, 'violations': []}


def test_last_slot_mutation_preserves_all_reported_volumes_but_breaks_final():
    req = scenario('final_volume')
    result = optimize(req)
    assert check_schedule(req, result)['valid']
    assert result['schedule'][-1]['pumps_on'] == ['P1']
    result['schedule'][-1]['pumps_on'] = []
    result['schedule'][-1]['kw'] = 10
    checked = check_schedule(req, result)
    assert checked == {'valid': False, 'violations': ['final volume is below initial volume']}
