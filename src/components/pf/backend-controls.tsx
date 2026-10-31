import { useState } from "react";
import { Activity, RotateCcw, Trash2, Flame, Power } from "lucide-react";
import { useSim } from "@/lib/sim-store";
import { DEFAULT_SYSTEM, type PeakfiveEvent } from "@/lib/peakfive-api";
import { Btn, NumField, Panel, Tag } from "./ui";

export function BackendConnection() {
  const s = useSim();
  return (
    <Tag
      tone={s.connection === "Connected" ? "ok" : s.connection === "Optimizing" ? "info" : "bad"}
    >
      <Activity className="h-3 w-3" />
      {s.connection}
    </Tag>
  );
}
export function BackendSettings() {
  const s = useSim();
  const [address, setAddress] = useState(s.apiUrl);
  return (
    <Panel title="Scheduling backend" right={<BackendConnection />}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-xs text-muted-foreground">
          API base URL
          <input
            type="url"
            className="field mt-1 w-full"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="https://your-backend.example.com"
          />
        </label>
        <Btn
          onClick={() => {
            s.setApiUrl(address);
          }}
          disabled={s.optimizing}
        >
          Apply address
        </Btn>
        <Btn
          size="icon"
          aria-label="Check backend connection"
          title="Check backend connection"
          onClick={s.checkConnection}
          disabled={s.optimizing}
        >
          <Activity className="h-4 w-4" />
        </Btn>
      </div>
      {s.connectionError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {s.connectionError}
        </p>
      )}
    </Panel>
  );
}
export function BackendScenarios() {
  const s = useSim();
  const sys = s.system;
  const [start, setStart] = useState(68);
  const [end, setEnd] = useState(76);
  const [extra, setExtra] = useState(30);
  const [pump, setPump] = useState("P1");
  const [demandText, setDemandText] = useState(sys.demand_m3_per_slot.join(", "));
  const [demandError, setDemandError] = useState<string | null>(null);
  const updateTank = (key: keyof typeof sys.tank, v: number) =>
    s.setSystem({ ...sys, tank: { ...sys.tank, [key]: v } });
  const add = (event: PeakfiveEvent) => {
    if (end <= start) return;
    s.setEvents([...s.events, event]);
  };
  const time = (slot: number) =>
    `${String(Math.floor(slot / 4)).padStart(2, "0")}:${String((slot % 4) * 15).padStart(2, "0")}`;
  return (
    <div className="space-y-5">
      <BackendSettings />
      <div className="flex flex-wrap gap-2">
        <Btn
          variant="danger"
          disabled={s.optimizing}
          onClick={() => s.runOptimize({ ...s.config, pump1: false })}
        >
          <Power className="h-4 w-4" />
          Fail P1 all day
        </Btn>
        <Btn
          variant="warn"
          disabled={s.optimizing}
          onClick={() => s.runOptimize({ ...s.config, peakStart: 10, peakEnd: 14 })}
        >
          Unexpected peak
        </Btn>
        <Btn
          disabled={s.optimizing}
          onClick={() => {
            s.setSystem(DEFAULT_SYSTEM);
            s.setEvents([]);
            s.setDraft({ peakStart: 16, peakEnd: 20 });
            setDemandText(DEFAULT_SYSTEM.demand_m3_per_slot.join(", "));
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Restore illustrative system
        </Btn>
      </div>
      <Panel title="Operating constraints" right={<Tag tone="warn">Illustrative water system</Tag>}>
        <fieldset disabled={s.optimizing} className="grid gap-4 md:grid-cols-3">
          <NumField
            label="Tank capacity"
            unit="m³"
            value={sys.tank.capacity_m3}
            min={0}
            onChange={(v) => updateTank("capacity_m3", v)}
          />
          <NumField
            label="Initial storage"
            unit="m³"
            value={sys.tank.initial_m3}
            min={0}
            onChange={(v) => updateTank("initial_m3", v)}
          />
          <NumField
            label="Operating minimum"
            unit="m³"
            value={sys.tank.min_operating_m3}
            min={0}
            onChange={(v) => updateTank("min_operating_m3", v)}
          />
          <NumField
            label="Fire reserve"
            unit="m³"
            value={sys.tank.fire_reserve_m3}
            min={0}
            onChange={(v) => updateTank("fire_reserve_m3", v)}
          />
          <NumField
            label="Essential site load"
            unit="kW"
            value={sys.base_load_kw}
            min={0}
            onChange={(v) => s.setSystem({ ...sys, base_load_kw: v })}
          />
          <div className="text-sm text-muted-foreground">
            Hard storage floor{" "}
            <span className="num font-semibold text-foreground">
              {sys.tank.min_operating_m3 + sys.tank.fire_reserve_m3} m³
            </span>
          </div>
          <label className="text-xs text-muted-foreground">
            Peak window start
            <input
              aria-label="Peak window start"
              type="time"
              step={900}
              value={time(s.config.peakStart * 4)}
              className="field mt-1 w-full"
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                if (Number.isFinite(h) && Number.isFinite(m)) s.setDraft({ peakStart: h + m / 60 });
              }}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Peak window end
            <select
              aria-label="Peak window end"
              className="field mt-1 w-full"
              value={s.config.peakEnd * 4}
              onChange={(e) => s.setDraft({ peakEnd: Number(e.target.value) / 4 })}
            >
              {Array.from({ length: 97 }, (_, t) => (
                <option key={t} value={t}>
                  {time(t)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        {sys.pumps.map((p, i) => (
          <Panel key={p.id} title={`Pump ${p.id}`}>
            <fieldset disabled={s.optimizing} className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex items-center justify-between text-sm">
                Available all day
                <input
                  aria-label={`${p.id} available`}
                  type="checkbox"
                  checked={p.available}
                  onChange={(e) =>
                    s.setSystem({
                      ...sys,
                      pumps: sys.pumps.map((x, n) =>
                        n === i ? { ...x, available: e.target.checked } : x,
                      ),
                    })
                  }
                />
              </label>
              {(
                [
                  ["kw", "Power (kW)"],
                  ["flow_m3h", "Flow (m³/hour)"],
                  ["min_run_slots", "Minimum ON slots"],
                  ["min_off_slots", "Minimum OFF slots"],
                  ["max_starts_per_day", "Maximum daily starts"],
                ] as const
              ).map(([k, label]) => (
                <NumField
                  key={k}
                  label={label}
                  value={p[k]}
                  min={k === "min_run_slots" || k === "min_off_slots" ? 1 : 0}
                  onChange={(v) =>
                    s.setSystem({
                      ...sys,
                      pumps: sys.pumps.map((x, n) => (n === i ? { ...x, [k]: v } : x)),
                    })
                  }
                />
              ))}
            </fieldset>
          </Panel>
        ))}
      </div>
      <Panel title="Emergency events">
        <fieldset disabled={s.optimizing} className="grid gap-3 md:grid-cols-4">
          <NumField label="Start slot" value={start} min={0} max={95} onChange={setStart} />
          <NumField label="End slot (exclusive)" value={end} min={1} max={96} onChange={setEnd} />
          <NumField
            label="Extra fire demand per slot"
            unit="m³"
            min={0}
            value={extra}
            onChange={setExtra}
          />
          <label className="text-xs text-muted-foreground">
            Outage pump
            <select
              className="field mt-1 w-full"
              value={pump}
              onChange={(e) => setPump(e.target.value)}
            >
              {sys.pumps.map((p) => (
                <option key={p.id}>{p.id}</option>
              ))}
            </select>
          </label>
        </fieldset>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn
            variant="danger"
            disabled={s.optimizing || end <= start}
            onClick={() =>
              add({ type: "fire", start_slot: start, end_slot: end, extra_m3_per_slot: extra })
            }
          >
            <Flame className="h-4 w-4" />
            Fire Emergency
          </Btn>
          <Btn
            variant="warn"
            disabled={s.optimizing || end <= start}
            onClick={() =>
              add({ type: "pump_outage", pump_id: pump, start_slot: start, end_slot: end })
            }
          >
            <Power className="h-4 w-4" />
            Pump Outage
          </Btn>
        </div>
        <ul className="mt-3 space-y-2">
          {s.events.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {e.type === "fire" ? `Fire +${e.extra_m3_per_slot} m³/slot` : `${e.pump_id} outage`}{" "}
                · {time(e.start_slot)}–{time(Math.min(96, e.end_slot))}
              </span>
              <Btn
                size="icon"
                title="Remove event"
                aria-label={`Remove event ${i + 1}`}
                disabled={s.optimizing}
                onClick={() => s.setEvents(s.events.filter((_, n) => n !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Btn>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        title="Synthetic municipal water demand"
        sub={`${sys.demand_m3_per_slot.length} intervals · ${sys.demand_m3_per_slot.reduce((a, b) => a + b, 0).toFixed(1)} m³/day before emergency demand`}
      >
        <textarea
          aria-label="96 water demand values"
          className="field num h-32 w-full"
          value={demandText}
          onChange={(e) => setDemandText(e.target.value)}
          disabled={s.optimizing}
        />
        <Btn
          className="mt-3"
          disabled={s.optimizing}
          onClick={() => {
            const tokens = demandText.trim().split(/[\s,]+/);
            const values = tokens.map(Number);
            if (values.length !== 96 || values.some((v) => !Number.isFinite(v) || v < 0)) {
              setDemandError("Enter exactly 96 finite, non-negative demand values.");
              return;
            }
            s.setSystem({ ...sys, demand_m3_per_slot: values });
            setDemandError(null);
          }}
        >
          Apply demand
        </Btn>
        {demandError && <p className="mt-2 text-sm text-destructive">{demandError}</p>}
      </Panel>
    </div>
  );
}
