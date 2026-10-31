"""Independent verifier of the simplified reservoir model, not hydraulic safety.

Absolute tolerance is 1e-6 kW or m3 (no relative tolerance). tank_m3 is the
START-of-slot volume; the initial volume is boundary zero. Events are a list of
{type: 'fire', start_slot, end_slot, extra_m3_per_slot} or
{type: 'pump_outage', start_slot, end_slot, pump_id}. Intervals are half-open.
Fire demand also accepts demand_m3_per_slot. Event start/end may be HH:MM;
end may instead be duration_slots or duration_minutes. Events extending past
midnight are clipped to boundary 96, matching the optimizer's horizon. Field
precedence is start_slot over start; end_slot, end, duration_slots, then
duration_minutes; extra_m3_per_slot over demand_m3_per_slot. Every supplied
recognized event field is validated, including lower-precedence aliases.
Peak windows accept slot objects or HH:MM pairs, including wrapped/empty windows.
The final boundary 96 is reconstructed even though no row reports it.
Pumps start off, with minimum off time already satisfied. Runs begun within the
day must complete their minimum on time before midnight; a trailing off period
need not complete unless another start occurs. No cross-day state is inferred.
"""
import math
from datetime import date

TOLERANCE = 1e-6
SLOTS = 96


class _Invalid(ValueError):
    pass


def _number(value, name, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _Invalid(f'{name}: expected a finite number')
    try:
        finite = math.isfinite(value)
    except (OverflowError, TypeError):
        finite = False
    if not finite or value < minimum:
        raise _Invalid(f'{name}: invalid numeric value')
    return value


def _integer(value, name, minimum=0, maximum=None):
    if type(value) is not int or value < minimum or (maximum is not None and value > maximum):
        raise _Invalid(f'{name}: invalid integer')
    return value


def _time(value, name):
    if not isinstance(value, str) or len(value) != 5 or value[2] != ':' or not (value[:2].isdigit() and value[3:].isdigit()):
        raise _Invalid(f'{name}: expected HH:MM')
    hour, minute = int(value[:2]), int(value[3:])
    if hour > 24 or minute > 59 or (hour == 24 and minute) or minute % 15:
        raise _Invalid(f'{name}: out-of-range or unaligned time')
    return hour * 4 + minute // 15


def _peak(value):
    if isinstance(value, dict):
        start = _integer(value['start_slot'], 'peak.start_slot', 0, 96)
        end = _integer(value['end_slot'], 'peak.end_slot', 0, 96)
    elif isinstance(value, (list, tuple)) and len(value) == 2:
        start, end = [_time(v, 'peak time') for v in value]
    else:
        raise _Invalid('peak_window: expected slot object or HH:MM pair')
    return list(range(start, end)) if start <= end else list(range(start, 96)) + list(range(end))


def _event_interval(event):
    if not isinstance(event, dict):
        raise _Invalid('event: expected object')
    parsed = {}
    for key in ('start_slot', 'end_slot', 'duration_slots', 'duration_minutes'):
        if key in event:
            parsed[key] = _integer(event[key], 'event.' + key)
    for key in ('start', 'end'):
        if key in event:
            parsed[key] = _time(event[key], 'event.' + key)
    if 'duration_minutes' in parsed and parsed['duration_minutes'] % 15:
        raise _Invalid('event.duration_minutes must be a multiple of 15')
    start = parsed['start_slot'] if 'start_slot' in parsed else parsed['start']
    if 'end_slot' in parsed:
        end = parsed['end_slot']
    elif 'end' in parsed:
        end = parsed['end']
    elif 'duration_slots' in parsed:
        end = start + parsed['duration_slots']
    else:
        end = start + parsed['duration_minutes'] // 15
    if not 0 <= start < 96 or end <= start:
        raise _Invalid('event: empty or out-of-range interval')
    return start, min(end, 96)


def check_schedule(request: dict, result: dict) -> dict:
    """Return structured violations; malformed data fails closed, without mutation."""
    errors = []
    try:
        if not isinstance(request, dict) or not isinstance(result, dict):
            raise _Invalid('request and result must be objects')
        if not isinstance(request['date'], str):
            raise _Invalid('date: expected ISO date')
        date.fromisoformat(request['date'])
        peak = _peak(request['peak_window'])
        system = request['system']
        if type(system['slot_minutes']) is not int or system['slot_minutes'] != 15:
            raise _Invalid('slot_minutes must equal 15')
        base = _number(system['base_load_kw'], 'base_load_kw')
        tank = system['tank']
        capacity, initial, operating, reserve = [
            _number(tank[key], 'tank.' + key) for key in
            ('capacity_m3', 'initial_m3', 'min_operating_m3', 'fire_reserve_m3')]
        floor = operating + reserve
        if not math.isfinite(floor):
            raise _Invalid('tank minimum plus reserve overflows')
        demand = system['demand_m3_per_slot']
        if not isinstance(demand, list) or len(demand) != SLOTS:
            raise _Invalid('demand_m3_per_slot must contain exactly 96 values')
        demand = [_number(x, f'demand[{i}]') for i, x in enumerate(demand)]
        if not isinstance(system['pumps'], list):
            raise _Invalid('pumps must be a list')
        pumps = {}
        for p in system['pumps']:
            pid = p['id']
            if not isinstance(pid, str) or not pid or pid in pumps:
                raise _Invalid('pump IDs must be unique nonempty strings')
            for key in ('kw', 'flow_m3h'):
                _number(p[key], f'{pid}.{key}')
            for key in ('min_run_slots', 'min_off_slots', 'max_starts_per_day'):
                _integer(p[key], f'{pid}.{key}')
            if type(p['available']) is not bool:
                raise _Invalid(f'{pid}.available must be boolean')
            pumps[pid] = p
        outages = [set() for _ in range(SLOTS)]
        events = request.get('events', [])
        if not isinstance(events, list):
            raise _Invalid('events must be a list')
        for event in events:
            start, end = _event_interval(event)
            if event['type'] == 'fire':
                for key in ('extra_m3_per_slot', 'demand_m3_per_slot'):
                    if key in event:
                        _number(event[key], 'fire.' + key)
                key = 'extra_m3_per_slot' if 'extra_m3_per_slot' in event else 'demand_m3_per_slot'
                extra = _number(event[key], 'fire.' + key)
                for t in range(start, end):
                    demand[t] += extra
                    _number(demand[t], 'combined demand')
            elif event['type'] == 'pump_outage':
                pid = event['pump_id']
                if not isinstance(pid, str) or pid not in pumps:
                    raise _Invalid('outage references unknown pump')
                for t in range(start, end):
                    outages[t].add(pid)
            else:
                raise _Invalid('unknown event type')
        if result['status'] not in ('optimal', 'feasible_timeout'):
            raise _Invalid('optimizer response is not optimal or feasible_timeout; no feasible schedule certified')
        schedule = result['schedule']
        if not isinstance(schedule, list) or len(schedule) != SLOTS:
            raise _Invalid('schedule must contain exactly 96 slots')
        states = {pid: [] for pid in pumps}
        volume = initial
        loads = []

        def boundary(t):
            if volume < floor - TOLERANCE:
                errors.append(f'boundary {t}: tank below minimum operating volume plus fire reserve')
            if volume > capacity + TOLERANCE:
                errors.append(f'boundary {t}: tank capacity exceeded')

        boundary(0)
        for t, row in enumerate(schedule):
            if type(row['slot']) is not int or row['slot'] != t:
                raise _Invalid(f'slot {t}: slots must be chronological and numbered 0–95')
            active = row['pumps_on']
            if not isinstance(active, list) or any(not isinstance(p, str) for p in active):
                raise _Invalid(f'slot {t}: pumps_on must be a list of IDs')
            if len(set(active)) != len(active) or any(p not in pumps for p in active):
                raise _Invalid(f'slot {t}: unknown or duplicate pump IDs')
            reported_kw = _number(row['kw'], f'slot {t}.kw')
            reported_volume = _number(row['tank_m3'], f'slot {t}.tank_m3', -math.inf)
            load = base + sum(pumps[p]['kw'] for p in active)
            if not math.isfinite(load) or not math.isfinite(volume):
                raise _Invalid(f'slot {t}: arithmetic overflow')
            loads.append(load)
            if abs(reported_kw - load) > TOLERANCE:
                errors.append(f'slot {t}: incorrect electricity load')
            if abs(reported_volume - volume) > TOLERANCE:
                errors.append(f'slot {t}: incorrect tank mass balance')
            volume += sum(pumps[p]['flow_m3h'] * 0.25 for p in active) - demand[t]
            if not math.isfinite(volume):
                raise _Invalid(f'slot {t}: arithmetic overflow')
            boundary(t + 1)
            for pid, pump in pumps.items():
                on = pid in active
                states[pid].append(on)
                if on and not pump['available']:
                    errors.append(f'slot {t}: unavailable pump {pid} running')
                if on and pid in outages[t]:
                    errors.append(f'slot {t}: pump outage violated for {pid}')
        if volume < initial - TOLERANCE:
            errors.append('final volume is below initial volume')
        for pid, on in states.items():
            p = pumps[pid]
            starts = [t for t in range(SLOTS) if on[t] and (t == 0 or not on[t - 1])]
            if len(starts) > p['max_starts_per_day']:
                errors.append(f'{pid}: daily pump-start limit exceeded')
            previous_end = None
            for start in starts:
                end = start
                while end < SLOTS and on[end]:
                    end += 1
                if end - start < p['min_run_slots']:
                    errors.append(f'{pid}: minimum ON duration violated at slot {start}')
                if previous_end is not None and start - previous_end < p['min_off_slots']:
                    errors.append(f'{pid}: minimum OFF duration violated at slot {start}')
                previous_end = end
        # Use independently reconstructed loads, never the reported row kW.
        # An empty peak window retains the optimizer's null metric contract.
        if peak:
            reported_peak = _number(result['coincident_kw_after'], 'coincident_kw_after')
            expected_peak = max(loads[t] for t in peak)
            if abs(reported_peak - expected_peak) > TOLERANCE:
                errors.append(f'coincident_kw_after: incorrect peak load '
                              f'(expected {expected_peak}, reported {reported_peak})')
        elif result['coincident_kw_after'] is not None:
            raise _Invalid('empty peak window must have null coincident_kw_after')
        if result['coincident_kw_before'] is not None:
            _number(result['coincident_kw_before'], 'coincident_kw_before')
        if not isinstance(result['explanation'], str):
            raise _Invalid('explanation must be a string')
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        errors.append(f'malformed input or result: {exc}')
    return {'valid': not errors, 'violations': errors}
