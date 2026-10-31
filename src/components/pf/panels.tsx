import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Gauge,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Upload,
  XCircle,
  Zap,
  Droplets,
  Activity,
  ShieldCheck,
} from "lucide-react";
import {
  CAPACITY,
  DEMAND,
  explainDifferences,
  PUMPS,
  stepLabel,
  type Combo,
  type Validation,
} from "@/lib/engine";
import { useSim } from "@/lib/sim-store";
import { cn } from "@/lib/utils";
import { Btn, Panel, Tag } from "./ui";

export function IllustrativeBanner() {
  const { dataset, mode } = useSim();
  if (dataset.source !== "ILLUSTRATIVE" && mode === "demo") return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {mode === "backend"
        ? "This prototype uses simulated municipal water infrastructure. Pump schedules are calculated by our optimization engine, while Ontario electricity-demand data is displayed separately using verified IESO data when available."
        : "Illustrative grid profile. Import official IESO data for historical analysis."}
    </div>
  );
}

export function SourceBadge() {
  const { dataset } = useSim();
  if (dataset.source === "IESO")
    return (
      <Tag tone="ok">
        <CheckCircle2 className="h-3 w-3" />
        Verified IESO Historical Data
      </Tag>
    );
  if (dataset.source === "UPLOAD")
    return (
      <Tag tone="ok">
        <CheckCircle2 className="h-3 w-3" />
        Validated IESO CSV upload
      </Tag>
    );
  return (
    <Tag tone="warn">
      <AlertTriangle className="h-3 w-3" />
      Illustrative data
    </Tag>
  );
}

export function KpiCards() {
  const {
    dataset,
    active,
    step,
    baseline,
    opt,
    status,
    config,
    mode,
    demand,
    capacity,
    hasSchedule,
    backendResult,
  } = useSim();
  const hourMw = dataset.hourly[Math.floor(step / 4)];
  const level = active.eval.levels[step];
  const served = demand.slice(0, step).reduce((a, b) => a + b, 0);
  const total = demand.reduce((a, b) => a + b, 0);
  const violations = active.validation.checks.filter((c) => !c.pass).length;
  const o = opt?.feasible ? opt.plan : undefined;
  const reduction = o && baseline.validation.pass ? baseline.eval.peakKwh - o.eval.peakKwh : null;
  const statusTone =
    status === "Optimized"
      ? "text-success"
      : status === "Infeasible"
        ? "text-destructive"
        : status === "Baseline"
          ? "text-primary"
          : "text-warning";
  const cards = [
    {
      icon: Zap,
      label: "Ontario Demand",
      value: `${hourMw.toLocaleString()}`,
      unit: "MW",
      sub: `Hour ending ${Math.floor(step / 4) + 1} · ${dataset.source === "ILLUSTRATIVE" ? "illustrative" : "IESO"}`,
    },
    {
      icon: Gauge,
      label: mode === "backend" ? "Facility Demand" : "Pump Demand",
      value: hasSchedule ? `${active.eval.kw[step].toFixed(1)}` : "—",
      unit: "kW",
      sub: `${mode === "backend" ? (hasSchedule ? "Backend" : "Awaiting backend") : active === baseline ? "Baseline" : "Optimized"} · ${stepLabel(step)}`,
    },
    {
      icon: Droplets,
      label: "Reservoir Level",
      value: hasSchedule ? level.toFixed(1) : "—",
      unit: "m³",
      sub: `${Math.round((level / capacity) * 100)}% of ${capacity} m³${hasSchedule ? "" : " · initial configuration"}`,
    },
    {
      icon: Activity,
      label: mode === "backend" ? "Peak-Window Demand" : "Peak-Window Reduction",
      value:
        mode === "backend"
          ? (backendResult?.coincident_kw_after?.toFixed(1) ?? "—")
          : reduction === null
            ? "—"
            : reduction.toFixed(1),
      unit: mode === "backend" ? "kW" : reduction === null ? "" : "kWh",
      sub:
        mode === "backend"
          ? "Maximum site load · no baseline savings claim"
          : reduction === null
            ? "Run the optimizer"
            : "vs demo baseline",
    },
    {
      icon: Droplets,
      label: "Water Requirements",
      value: hasSchedule ? served.toFixed(1) : "—",
      unit: `/ ${total.toFixed(1)} m³`,
      sub: `${(total - served).toFixed(1)} m³ remaining · ${violations} violation${violations === 1 ? "" : "s"}`,
    },
    {
      icon: ShieldCheck,
      label: "Optimization Status",
      value: status,
      unit: "",
      sub: opt ? `Last run ${new Date(opt.ranAt).toLocaleTimeString()}` : "No optimization run yet",
      tone: statusTone,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="panel p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <c.icon className="h-3.5 w-3.5 text-primary" />
            {c.label}
          </div>
          <div className={cn("num mt-2 text-xl font-semibold", c.tone)}>
            {c.value} <span className="text-xs font-normal text-muted-foreground">{c.unit}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function Playback() {
  const {
    step,
    setStep,
    playing,
    setPlaying,
    speed,
    setSpeed,
    view,
    setView,
    opt,
    mode,
    hasSchedule,
  } = useSim();
  return (
    <div className="panel flex flex-wrap items-center gap-3 p-3">
      <div className="flex gap-1">
        <Btn
          size="icon"
          aria-label="Restart"
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </Btn>
        <Btn size="icon" aria-label="Step backward" onClick={() => setStep(step - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Btn>
        <Btn
          size="icon"
          variant="primary"
          aria-label={playing ? "Pause" : "Play"}
          disabled={!hasSchedule}
          onClick={() => {
            if (step >= 95) setStep(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Btn>
        <Btn size="icon" aria-label="Step forward" onClick={() => setStep(step + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Btn>
      </div>
      <span className="num w-12 text-sm font-semibold text-primary">{stepLabel(step)}</span>
      <input
        type="range"
        min={0}
        max={95}
        value={step}
        onChange={(e) => setStep(Number(e.target.value))}
        className="min-w-40 flex-1"
        aria-label="Simulation time"
        disabled={!hasSchedule}
      />
      <div className="flex gap-1">
        {[1, 4, 12, 24].map((s) => (
          <Btn
            key={s}
            size="sm"
            variant={speed === s ? "active" : "ghost"}
            onClick={() => setSpeed(s)}
          >
            {s}×
          </Btn>
        ))}
      </div>
      <div className="flex gap-1">
        {mode === "demo" && (
          <Btn
            size="sm"
            variant={view === "baseline" ? "active" : "ghost"}
            onClick={() => setView("baseline")}
          >
            Demo baseline
          </Btn>
        )}
        <Btn
          size="sm"
          variant={view === "optimized" ? "active" : "ghost"}
          disabled={!opt?.feasible}
          onClick={() => setView("optimized")}
        >
          {mode === "backend" ? "Backend schedule" : "Demo optimized"}
        </Btn>
      </div>
    </div>
  );
}

export function DataControls() {
  const {
    date,
    setDate,
    loadIeso,
    loading,
    dataError,
    uploadCsv,
    official,
    useOfficial,
    setUseOfficial,
  } = useSim();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        className="field num"
        value={date}
        min="2024-01-01"
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Historical date"
      />
      <Btn size="sm" variant="primary" onClick={() => loadIeso()} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
        Load IESO data
      </Btn>
      <Btn size="sm" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" />
        Upload IESO CSV
      </Btn>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadCsv(f, date);
          e.target.value = "";
        }}
      />
      <div className="flex rounded-lg border border-border p-0.5">
        <button
          className={cn(
            "rounded-md px-2.5 py-1 text-xs",
            useOfficial && official ? "bg-primary/15 text-primary" : "text-muted-foreground",
          )}
          disabled={!official}
          onClick={() => setUseOfficial(true)}
        >
          Official
        </button>
        <button
          className={cn(
            "rounded-md px-2.5 py-1 text-xs",
            !useOfficial || !official ? "bg-warning/15 text-warning" : "text-muted-foreground",
          )}
          onClick={() => setUseOfficial(false)}
        >
          Illustrative
        </button>
      </div>
      {dataError && <span className="w-full text-xs text-destructive">{dataError}</span>}
    </div>
  );
}

export function ValidationPanel({
  validation,
  title = "Independent constraint check",
}: {
  validation: Validation;
  title?: string;
}) {
  return (
    <Panel
      title={title}
      right={validation.pass ? <Tag tone="ok">PASS</Tag> : <Tag tone="bad">FAIL</Tag>}
    >
      <ul className="space-y-2 text-sm">
        {validation.checks.map((c) => (
          <li key={c.name} className="flex items-start gap-2">
            {c.pass ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="num text-xs text-muted-foreground">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function InfeasiblePanel() {
  const { opt, baseline, mode, backendResult } = useSim();
  const msgs: string[] = [];
  if (opt && !opt.feasible && opt.reason) msgs.push(opt.reason);
  if (mode === "demo" && !baseline.validation.pass)
    msgs.push(
      `The rule-based baseline violates constraints (${baseline.validation.checks
        .filter((c) => !c.pass)
        .map((c) => c.name)
        .join(", ")}). No improvement is claimed against it.`,
    );
  if (mode === "backend" && backendResult?.status === "feasible_timeout")
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
        Feasible schedule — not proven optimal. {backendResult.explanation}
      </div>
    );
  if (!msgs.length) return null;
  return (
    <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
      <div className="flex items-center gap-2 font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" />
        {mode === "backend"
          ? backendResult?.status === "timeout_no_solution"
            ? "Feasibility remains unknown"
            : backendResult?.status === "invalid_input"
              ? "Invalid scenario inputs"
              : backendResult?.status === "infeasible"
                ? "Infeasible scenario"
                : "Backend request failed"
          : "No valid schedule"}
      </div>
      {msgs.map((m) => (
        <p key={m} className="mt-1.5 text-sm text-foreground/90">
          {m}
        </p>
      ))}
    </div>
  );
}

export function Explanation() {
  const { baseline, opt, config, mode, backendResult } = useSim();
  if (mode === "backend")
    return (
      <p className="text-sm text-muted-foreground">
        {backendResult?.explanation ?? "No backend optimization run yet."}
      </p>
    );
  if (!opt?.feasible || !opt.plan)
    return (
      <p className="text-sm text-muted-foreground">
        Run the optimizer to see which pumping periods move and why.
      </p>
    );
  return (
    <ul className="space-y-2 text-sm">
      {explainDifferences(baseline.eval, opt.plan.eval, config).map((l) => (
        <li key={l} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          {l}
        </li>
      ))}
    </ul>
  );
}

export function Gantt({
  combos,
  levels,
  label,
}: {
  combos: Combo[];
  levels: number[];
  label: string;
}) {
  const { config, step, setStep, pumps, capacity, demand, mode, backendResult } = useSim();
  const rows = [
    ...pumps.map((p, i) => ({
      name: p.name.replace("High-Lift ", ""),
      cell: (t: number) => (
        <div
          className={cn(
            "h-full w-full",
            (
              mode === "backend"
                ? backendResult?.schedule[t]?.pumps_on.includes(p.id)
                : combos[t] & (1 << i)
            )
              ? "bg-success"
              : "bg-idle/40",
          )}
        />
      ),
    })),
    {
      name: "Reservoir",
      cell: (t: number) => (
        <div className="flex h-full w-full items-end">
          <div className="w-full bg-water" style={{ height: `${(levels[t] / capacity) * 100}%` }} />
        </div>
      ),
    },
    {
      name: "Demand",
      cell: (t: number) => (
        <div className="flex h-full w-full items-end">
          <div
            className="w-full bg-warning/70"
            style={{ height: `${(demand[t] / Math.max(1, ...demand)) * 100}%` }}
          />
        </div>
      ),
    },
  ];
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2">
            <div className="w-20 shrink-0 text-[11px] text-muted-foreground">{r.name}</div>
            <div className="relative flex h-6 flex-1 overflow-hidden rounded">
              {Array.from({ length: 96 }, (_, t) => (
                <button
                  key={t}
                  type="button"
                  aria-label={stepLabel(t)}
                  onClick={() => setStep(t)}
                  className={cn(
                    "relative h-full flex-1 border-r border-background/40",
                    (config.peakStart <= config.peakEnd
                      ? t >= config.peakStart * 4 && t < config.peakEnd * 4
                      : t >= config.peakStart * 4 || t < config.peakEnd * 4) &&
                      "ring-1 ring-inset ring-destructive/60",
                    t === step && "outline outline-2 outline-foreground z-10",
                  )}
                >
                  {r.cell(t)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <div className="w-20" />
          <div className="num flex flex-1 justify-between text-[10px] text-muted-foreground">
            {[0, 4, 8, 12, 16, 20, 24].map((h) => (
              <span key={h}>{String(h).padStart(2, "0")}:00</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OptimizeButton({
  size = "lg",
  label = "Optimize Schedule",
}: {
  size?: "md" | "lg";
  label?: string;
}) {
  const { runOptimize, optimizing } = useSim();
  const [, force] = useState(0);
  return (
    <Btn
      variant="primary"
      size={size}
      disabled={optimizing}
      onClick={async () => {
        await runOptimize();
        force((n) => n + 1);
      }}
    >
      {optimizing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Optimizing 96 intervals…
        </>
      ) : (
        <>
          <Zap className="h-4 w-4" />
          {label}
        </>
      )}
    </Btn>
  );
}

export function IciPanel() {
  return (
    <Panel
      title="Historical ICI peak context"
      sub="Separately sourced metric — not part of the hourly series above"
    >
      <div className="num text-2xl font-semibold text-warning">25,646 MW</div>
      <div className="mt-1 text-sm">July 14, 2026 · hour ending 17</div>
      <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div>
          <span className="text-foreground">Metric:</span> ICI Ontario Demand (Peak Tracker)
        </div>
        <div>
          <span className="text-foreground">Source:</span>{" "}
          <a
            className="text-primary underline"
            href="https://www.ieso.ca/peaktracker/"
            target="_blank"
            rel="noreferrer"
          >
            IESO Peak Tracker
          </a>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        ICI Ontario Demand differs from the hourly “Ontario Demand” column, so this value is never
        inserted into the chart data.
      </p>
    </Panel>
  );
}
