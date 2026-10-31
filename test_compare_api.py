"""HTTP integration tests for POST /compare (and POST /optimize preservation).

Requests go through the real ASGI app, so the body-size limit, CORS and the
shared solve limit are exercised. A tiny in-process driver is used instead of
TestClient so no extra dependency (httpx) is needed.

Run: .venv/bin/python -m pytest api/tests -v
"""
import asyncio
import copy
import json
import threading
from collections import namedtuple

import pytest

import baseline.compare as compare_module
from api import main
from baseline.hysteresis import check_baseline
from optimizer.checker import check_schedule
from optimizer.model import illustrative_request, optimize

Response = namedtuple('Response', 'status headers body')
PEAK_16_20 = range(64, 80)


@pytest.fixture(autouse=True)
def fresh_semaphore():
    # Each test drives the app in a new event loop; the lazy semaphore must
    # not be shared across loops.
    main._solve_slots = None
    yield
    main._solve_slots = None


async def _call(method, path, body=b'', headers=None):
    headers = dict(headers or {})
    if body:
        headers.setdefault('content-type', 'application/json')
        headers.setdefault('content-length', str(len(body)))
    messages, done, first = [], asyncio.Event(), [True]

    async def receive():
        if first[0]:
            first[0] = False
            return {'type': 'http.request', 'body': body, 'more_body': False}
        await done.wait()
        return {'type': 'http.disconnect'}

    async def send(message):
        messages.append(message)
        if message['type'] == 'http.response.body' and not message.get('more_body', False):
            done.set()

    scope = {'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
             'method': method, 'scheme': 'http', 'path': path, 'raw_path': path.encode(),
             'query_string': b'', 'root_path': '', 'client': ('127.0.0.1', 50000),
             'server': ('testserver', 80),
             'headers': [(k.lower().encode(), v.encode()) for k, v in headers.items()]}
    await main.app(scope, receive, send)
    start = next(m for m in messages if m['type'] == 'http.response.start')
    raw = b''.join(m.get('body', b'') for m in messages if m['type'] == 'http.response.body')
    hdrs = {k.decode().lower(): v.decode() for k, v in start['headers']}
    is_json = hdrs.get('content-type', '').startswith('application/json')
    return Response(start['status'], hdrs, json.loads(raw) if raw and is_json else raw)


def post(path, payload, raw=None, headers=None):
    body = raw if raw is not None else json.dumps(payload).encode()
    return asyncio.run(_call('POST', path, body, headers))


def scenario(mutate=None):
    req = illustrative_request()
    if mutate:
        mutate(req)
    return req


def peak_from_rows(schedule, slots=PEAK_16_20):
    return max(schedule[t]['kw'] for t in slots)


def keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from keys(v)


# --------------------------------------------------------------------------- #
# Normal operation
# --------------------------------------------------------------------------- #

def test_compare_illustrative_comparison_available():
    req = scenario()
    r = post('/compare', req)
    assert r.status == 200
    b = r.body
    assert b['status'] == 'comparison_available'
    base, opt = b['baseline'], b['optimized']
    assert base['valid'] and opt['valid'] and base['applicable']
    assert base['violations'] == [] and opt['violations'] == []
    assert opt['status'] in ('optimal', 'feasible_timeout')
    assert len(base['schedule']) == 96 and len(opt['schedule']) == 96
    pw = b['peak_window']
    assert pw['unit'] == 'kW'
    # Pinned demo figures, but derived below from the returned rows as well.
    assert (pw['baseline_kw'], pw['optimized_kw'], pw['reduction_kw']) == (160, 30, 130)
    assert pw['reduction_pct'] == pytest.approx(81.25)
    assert pw['baseline_kw'] == peak_from_rows(base['schedule'])
    assert pw['optimized_kw'] == peak_from_rows(opt['schedule'])


def test_returned_schedules_pass_independent_checker_again():
    req = scenario()
    b = post('/compare', req).body
    base, opt = b['baseline'], b['optimized']
    assert check_baseline(req, {'schedule': base['schedule'], 'label': base['label'],
                                'peak_window_kw': base['metrics']['peak_window_kw']})['valid']
    view = {'status': opt['status'], 'schedule': opt['schedule'], 'coincident_kw_before': None,
            'coincident_kw_after': opt['metrics']['peak_window_kw'], 'explanation': ''}
    assert check_schedule(req, view) == {'valid': True, 'violations': []}


@pytest.mark.parametrize('mutate,expected', [
    (lambda q: q['system'].update(base_load_kw=45), (175, 45)),
    # P2 at 60 kW is less efficient than P1, so P1 becomes the baseline lead pump.
    (lambda q: q['system']['pumps'][1].update(kw=60), (110, 30)),
])
def test_reduction_is_computed_from_submitted_scenario(mutate, expected):
    req = scenario(mutate)
    b = post('/compare', req).body
    assert b['status'] == 'comparison_available'
    assert b['optimized']['status'] == 'optimal'  # fast, proven: not time-limit dependent
    pw = b['peak_window']
    assert (pw['baseline_kw'], pw['optimized_kw']) == expected
    assert pw['reduction_kw'] == pw['baseline_kw'] - pw['optimized_kw']
    assert pw['reduction_pct'] == pytest.approx(
        (pw['baseline_kw'] - pw['optimized_kw']) / pw['baseline_kw'] * 100)
    assert pw['baseline_kw'] == b['baseline']['metrics']['peak_window_kw']
    assert pw['optimized_kw'] == b['optimized']['metrics']['peak_window_kw']


def test_kw_and_kwh_reported_separately_with_energy_caveat():
    b = post('/compare', scenario()).body
    energy = b['energy']
    assert energy['unit'] == 'kWh' and b['peak_window']['unit'] == 'kW'
    m_base, m_opt = b['baseline']['metrics'], b['optimized']['metrics']
    assert energy['baseline_pump_kwh'] == m_base['pump_energy_kwh']
    assert energy['optimized_pump_kwh'] == m_opt['pump_energy_kwh']
    assert energy['optimized_minus_baseline_kwh'] == pytest.approx(
        m_opt['pump_energy_kwh'] - m_base['pump_energy_kwh'])
    assert energy['optimized_minus_baseline_end_of_day_m3'] == pytest.approx(
        m_opt['end_of_day_m3'] - m_base['end_of_day_m3'])
    assert 'must not be presented as energy-efficiency savings' in energy['note']


def test_labels_and_caveats_present_and_no_financial_fields():
    b = post('/compare', scenario()).body
    label = b['label']
    for phrase in ('SIMULATED', 'illustrative unvalidated', 'Not actual Hamilton',
                   'not financial savings'):
        assert phrase in label
    assert 'Simulated modified conventional operation' in b['baseline']['label']
    text = ' '.join(b['caveats'])
    assert 'not an energy (kWh) saving' in text and 'No tariffs or costs' in text
    assert not any(k for k in keys(b) if 'saving' in k.lower() or 'cost' in k.lower()
                   or 'price' in k.lower())
    assert '$' not in json.dumps(b)


def test_empty_peak_window_gives_null_reduction():
    b = post('/compare', scenario(lambda q: q.update(peak_window=['00:00', '00:00']))).body
    assert b['status'] == 'comparison_available'
    assert b['peak_window']['reduction_kw'] is None and b['peak_window']['reduction_pct'] is None
    assert any('peak window is empty' in c for c in b['caveats'])


def test_fire_event_comparison_still_validated():
    req = scenario(lambda q: q.update(events=[{'type': 'fire', 'start': '17:00', 'end': '19:00',
                                               'extra_m3_per_slot': 30}]))
    b = post('/compare', req).body
    assert b['status'] == 'comparison_available'
    assert b['baseline']['valid'] and b['optimized']['valid']


def test_compare_is_deterministic_and_does_not_mutate_input():
    req = scenario()
    before = json.dumps(req, sort_keys=True)
    first = post('/compare', req).body
    assert post('/compare', req).body == first
    assert json.dumps(req, sort_keys=True) == before


# --------------------------------------------------------------------------- #
# Comparison suppressed
# --------------------------------------------------------------------------- #

def test_optimizer_infeasible_suppresses_comparison():
    req = scenario(lambda q: q['system']['pumps'][0].update(available=False))  # P2 alone
    r = post('/compare', req)
    assert r.status == 200
    b = r.body
    assert b['status'] == 'comparison_unavailable'
    assert b['peak_window'] is None and b['energy'] is None
    assert b['optimized']['status'] == 'infeasible'
    assert b['optimized']['schedule'] == [] and b['optimized']['metrics'] is None
    assert 'optimizer returned no schedule (status infeasible)' in b['explanation']


def test_invalid_baseline_suppresses_comparison_but_returns_both_schedules():
    req = scenario(lambda q: q['system']['pumps'][1].update(available=False))  # P1 alone
    b = post('/compare', req).body
    assert b['status'] == 'comparison_unavailable'
    assert b['peak_window'] is None and b['energy'] is None
    assert b['baseline']['violations'] == ['final volume is below initial volume']
    assert b['optimized']['valid'] and len(b['optimized']['schedule']) == 96
    assert len(b['baseline']['schedule']) == 96
    assert 'baseline schedule failed the independent checker' in b['explanation']


def test_baseline_not_applicable_to_tank_suppresses_comparison():
    req = scenario(lambda q: q['system']['tank'].update(capacity_m3=900))
    b = post('/compare', req).body
    assert b['status'] == 'comparison_unavailable'
    assert b['baseline']['applicable'] is False and b['baseline']['schedule'] == []
    assert 'lead_stop_m3 = 950 m3 is outside the tank band [450, 900] m3' in b['baseline']['violations'][0]
    assert b['optimized']['valid']
    assert b['peak_window'] is None


def test_initial_volume_outside_band_suppresses_comparison():
    req = scenario(lambda q: q['system']['tank'].update(initial_m3=400))
    b = post('/compare', req).body
    assert b['status'] == 'comparison_unavailable'
    assert b['optimized']['status'] == 'infeasible'
    assert b['peak_window'] is None


def test_optimizer_timeout_without_solution_suppresses_comparison(monkeypatch):
    def no_solution(req):
        return {'status': 'timeout_no_solution', 'schedule': [], 'coincident_kw_before': None,
                'coincident_kw_after': None,
                'explanation': 'CBC stopped (time limit 30 s) before finding a feasible schedule.'}

    monkeypatch.setattr(compare_module, 'optimize', no_solution)
    r = post('/compare', scenario())
    assert r.status == 200
    b = r.body
    assert b['status'] == 'comparison_unavailable'
    assert b['peak_window'] is None and b['energy'] is None
    assert b['optimized']['status'] == 'timeout_no_solution'
    assert b['optimized']['valid'] is False and b['optimized']['schedule'] == []
    assert b['optimized']['metrics'] is None
    assert b['baseline']['valid']  # baseline alone is fine, but no comparison
    assert 'optimizer returned no schedule (status timeout_no_solution)' in b['explanation']


def test_corrupted_optimizer_peak_metric_suppresses_comparison(monkeypatch):
    real = optimize

    def corrupted(req):
        result = real(req)
        result['coincident_kw_after'] = result['coincident_kw_after'] - 10  # misreported peak
        return result

    monkeypatch.setattr(compare_module, 'optimize', corrupted)
    r = post('/compare', scenario())
    assert r.status == 200
    b = r.body
    assert b['status'] == 'comparison_unavailable'
    assert b['peak_window'] is None and b['energy'] is None
    assert b['optimized']['valid'] is False
    assert any(v.startswith('coincident_kw_after: incorrect peak load')
               for v in b['optimized']['violations'])
    assert 'optimized schedule failed the independent checker' in b['explanation']


def test_feasible_timeout_is_compared_with_caveat(monkeypatch):
    real = optimize

    def timed_out(req):
        result = real(req)
        result['status'] = 'feasible_timeout'
        return result

    monkeypatch.setattr(compare_module, 'optimize', timed_out)
    b = post('/compare', scenario()).body
    assert b['status'] == 'comparison_available'
    assert b['optimized']['status'] == 'feasible_timeout'
    assert any('NOT proven optimal' in c for c in b['caveats'])


# --------------------------------------------------------------------------- #
# Invalid input, limits, errors
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize('mutate', [
    lambda q: q['system'].update(demand_m3_per_slot=[1.0] * 95),
    lambda q: q['system']['pumps'][0].update(kw=-5),
    lambda q: q.update(events=[{'type': 'meteor', 'start_slot': 1, 'end_slot': 2}]),
    lambda q: q['system'].pop('tank'),
])
def test_invalid_input_returns_422_with_optimizer_message(mutate):
    req = scenario(mutate)
    r = post('/compare', req)
    assert r.status == 422
    assert r.body['status'] == 'invalid_input'
    assert r.body['explanation'] == optimize(copy.deepcopy(req))['explanation']
    assert r.body['baseline'] is None and r.body['peak_window'] is None
    assert r.body['label'] and r.body['caveats']


def test_nonfinite_demand_rejected():
    req = scenario()
    req['system']['demand_m3_per_slot'][0] = float('nan')  # json.dumps emits bare NaN
    raw = json.dumps(req).encode()
    assert b'NaN' in raw
    r = post('/compare', None, raw=raw)
    assert r.status == 422 and r.body['status'] == 'invalid_input'


@pytest.mark.parametrize('raw', [b'not json', b'[1, 2, 3]'])
def test_non_object_body_rejected_by_fastapi(raw):
    r = post('/compare', None, raw=raw)
    assert r.status == 422 and 'detail' in r.body


def test_oversized_body_413():
    r = post('/compare', None, raw=b' ' * (main.MAX_BODY_BYTES + 1))
    assert r.status == 413 and r.body['status'] == 'invalid_input'


def test_optimizer_error_returns_500(monkeypatch):
    def broken(req):
        return {'status': 'error', 'schedule': [], 'coincident_kw_before': None,
                'coincident_kw_after': None, 'explanation': 'solver failure: test'}

    monkeypatch.setattr(compare_module, 'optimize', broken)
    r = post('/compare', scenario())
    assert r.status == 500 and r.body['status'] == 'error'
    assert r.body['peak_window'] is None


def test_unexpected_exception_returns_generic_500(monkeypatch):
    def boom(req):
        raise RuntimeError('secret internal detail')

    monkeypatch.setattr(main, 'comparison_response', boom)
    r = post('/compare', scenario())
    assert r.status == 500 and r.body['status'] == 'error'
    assert 'secret internal detail' not in json.dumps(r.body)


def test_compare_and_optimize_share_solve_limit(monkeypatch):
    gate = threading.Event()

    def slow_compare(req):
        gate.wait(10)
        return compare_module.comparison_error('comparison_unavailable', 'test')

    def slow_optimize(req):
        gate.wait(10)
        return optimize(req)

    monkeypatch.setattr(main, 'comparison_response', slow_compare)
    monkeypatch.setattr(main, 'optimize', slow_optimize)
    body = json.dumps(scenario()).encode()

    async def run():
        held = [asyncio.ensure_future(_call('POST', '/compare', body)),
                asyncio.ensure_future(_call('POST', '/optimize', body))]
        for _ in range(500):
            await asyncio.sleep(0.01)
            if main._solve_slots is not None and main._solve_slots.locked():
                break
        busy_compare = await _call('POST', '/compare', body)
        busy_optimize = await _call('POST', '/optimize', body)
        gate.set()
        return busy_compare, busy_optimize, await asyncio.gather(*held)

    busy_compare, busy_optimize, held = asyncio.run(run())
    assert busy_compare.status == 503 and busy_compare.headers['retry-after'] == '5'
    assert busy_compare.body['status'] == 'error' and 'label' in busy_compare.body
    assert busy_optimize.status == 503 and set(busy_optimize.body) == {
        'status', 'schedule', 'coincident_kw_before', 'coincident_kw_after', 'explanation'}
    assert [r.status for r in held] == [200, 200]


# --------------------------------------------------------------------------- #
# CORS
# --------------------------------------------------------------------------- #

def preflight(origin):
    return asyncio.run(_call('OPTIONS', '/compare', headers={
        'origin': origin, 'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type'}))


def test_cors_preflight_allowed_origin():
    r = preflight('http://localhost:5173')
    assert r.status == 200
    assert r.headers['access-control-allow-origin'] == 'http://localhost:5173'


def test_cors_preflight_disallowed_origin():
    r = preflight('https://evil.example.com')
    assert r.status == 400
    assert 'access-control-allow-origin' not in r.headers


def test_cors_header_on_compare_response():
    r = post('/compare', scenario(), headers={'origin': 'http://localhost:5173'})
    assert r.headers['access-control-allow-origin'] == 'http://localhost:5173'


# --------------------------------------------------------------------------- #
# POST /optimize preserved
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize('mutate', [
    None,
    lambda q: q.update(events=[{'type': 'fire', 'start': '17:00', 'end': '19:00',
                                'extra_m3_per_slot': 30}]),
    lambda q: q['system']['pumps'][0].update(available=False),  # infeasible
])
def test_optimize_endpoint_unchanged(mutate):
    req = scenario(mutate)
    r = post('/optimize', req)
    assert r.status == 200
    assert r.body == optimize(copy.deepcopy(req))
    assert set(r.body) == {'status', 'schedule', 'coincident_kw_before', 'coincident_kw_after',
                           'explanation'}


def test_optimize_invalid_input_unchanged():
    req = scenario(lambda q: q['system'].update(demand_m3_per_slot=[1.0] * 95))
    r = post('/optimize', req)
    assert r.status == 422
    assert r.body == optimize(copy.deepcopy(req))


def test_health():
    r = asyncio.run(_call('GET', '/health'))
    assert r.status == 200 and r.body == {'status': 'ok'}
