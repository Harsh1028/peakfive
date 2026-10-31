import { stepLabel } from "@/lib/engine";
import { useSim } from "@/lib/sim-store";
import { cn } from "@/lib/utils";

export function Tank({ size = "lg" }: { size?: "lg" | "sm" }) {
  const { active, step, config, capacity, demand, hasSchedule } = useSim();
  if (!hasSchedule)
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        Awaiting a backend schedule · initial storage {config.initial} m³
      </div>
    );
  const level = active.eval.levels[step];
  const next = active.eval.levels[step + 1];
  const pct = level / capacity;
  const inflow = active.eval.pumped[step];
  const out = demand[step];
  const state = next > level ? "Filling" : next < level ? "Draining" : "Stable";
  const H = 260,
    top = 20;
  const y = top + H * (1 - pct);
  const reserveY = top + H * (1 - config.minReserve / capacity);
  const targetY = top + H * (1 - config.finalTarget / capacity);
  const wave =
    "M0 8 Q 25 0 50 8 T 100 8 T 150 8 T 200 8 T 250 8 T 300 8 T 350 8 T 400 8 V 400 H 0 Z";
  return (
    <div className={cn("flex items-center gap-5", size === "sm" && "gap-3")}>
      <svg
        viewBox="0 0 200 300"
        className={size === "lg" ? "h-72 w-auto" : "h-48 w-auto"}
        role="img"
        aria-label={`Reservoir ${Math.round(pct * 100)}% full`}
      >
        <defs>
          <clipPath id="tankClip">
            <rect x="20" y={top} width="160" height={H} rx="14" />
          </clipPath>
          <linearGradient id="waterG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--water)" />
            <stop offset="1" stopColor="var(--water-deep)" />
          </linearGradient>
        </defs>
        <rect
          x="20"
          y={top}
          width="160"
          height={H}
          rx="14"
          fill="var(--background)"
          stroke="var(--border)"
          strokeWidth="2"
        />
        <g clipPath="url(#tankClip)">
          <g style={{ transform: `translateY(${y - 8}px)`, transition: "transform 0.6s ease" }}>
            <path d={wave} fill="var(--water)" opacity="0.45" className="animate-wave-slow" />
            <g transform="translate(-30 3)">
              <path d={wave} fill="url(#waterG)" className="animate-wave" />
            </g>
          </g>
        </g>
        <line
          x1="20"
          x2="180"
          y1={reserveY}
          y2={reserveY}
          stroke="var(--destructive)"
          strokeDasharray="5 4"
          strokeWidth="1.5"
        />
        <text x="176" y={reserveY - 4} textAnchor="end" fontSize="9" fill="var(--destructive)">
          MIN {config.minReserve}
        </text>
        <line
          x1="20"
          x2="180"
          y1={targetY}
          y2={targetY}
          stroke="var(--warning)"
          strokeDasharray="2 4"
          strokeWidth="1.2"
        />
        <text x="24" y={targetY - 4} fontSize="9" fill="var(--warning)">
          TARGET {config.finalTarget}
        </text>
        <text
          x="100"
          y="150"
          textAnchor="middle"
          fontSize="34"
          fontWeight="700"
          fill="var(--foreground)"
          fontFamily="var(--font-mono)"
        >
          {Math.round(pct * 100)}%
        </text>
        <text
          x="100"
          y="170"
          textAnchor="middle"
          fontSize="11"
          fill="var(--foreground)"
          opacity="0.8"
        >
          {level.toFixed(1)} / {capacity} m³
        </text>
      </svg>
      <dl className="space-y-3 text-sm">
        <Stat
          label="State"
          value={state}
          tone={
            state === "Filling"
              ? "text-success"
              : state === "Draining"
                ? "text-warning"
                : "text-muted-foreground"
          }
        />
        <Stat label="Inflow" value={`+${inflow.toFixed(1)} m³ / 15 min`} tone="text-primary" />
        <Stat
          label="Outflow (demand)"
          value={`−${out.toFixed(1)} m³ / 15 min`}
          tone="text-warning"
        />
        <Stat label="Time" value={stepLabel(step)} />
      </dl>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("num font-semibold", tone)}>{value}</dd>
    </div>
  );
}

export function PumpStation() {
  const { active, step, pumps, hasSchedule, mode, activeSchedule, events } = useSim();
  const c = active.combos[step];
  return (
    <div className="grid gap-3">
      {pumps.map((p, i) => {
        const on =
          hasSchedule &&
          (mode === "backend"
            ? !!activeSchedule?.[step]?.pumps_on.includes(p.id)
            : !!(c & (1 << i)));
        const avail =
          p.available &&
          !events.some(
            (e) =>
              e.type === "pump_outage" &&
              e.pump_id === p.id &&
              step >= e.start_slot &&
              step < e.end_slot,
          );
        return (
          <div
            key={p.id}
            className="flex items-center gap-4 rounded-lg border border-border bg-background/50 p-3"
          >
            <svg viewBox="0 0 60 60" className="h-14 w-14 shrink-0">
              <circle
                cx="30"
                cy="30"
                r="26"
                fill="var(--secondary)"
                stroke={on ? "var(--success)" : "var(--idle)"}
                strokeWidth="3"
              />
              <g className={on ? "animate-spin-slow" : ""} style={{ transformOrigin: "30px 30px" }}>
                {[0, 60, 120, 180, 240, 300].map((a) => (
                  <path
                    key={a}
                    d="M30 30 L30 10 Q38 14 34 26 Z"
                    fill={on ? "var(--success)" : "var(--idle)"}
                    transform={`rotate(${a} 30 30)`}
                  />
                ))}
              </g>
              <circle cx="30" cy="30" r="5" fill="var(--card)" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    on ? "bg-success animate-pulse-dot" : "bg-idle",
                  )}
                />
                <span className="text-sm font-semibold">{p.name}</span>
                {!avail && <span className="text-[11px] text-destructive">UNAVAILABLE</span>}
              </div>
              <div className="num mt-1 text-xs text-muted-foreground">
                {p.flow} m³/h · rated {p.kw} kW
              </div>
              <svg viewBox="0 0 200 8" className="mt-2 h-2 w-full" preserveAspectRatio="none">
                <line x1="0" x2="200" y1="4" y2="4" stroke="var(--secondary)" strokeWidth="8" />
                {on && (
                  <line
                    x1="0"
                    x2="200"
                    y1="4"
                    y2="4"
                    stroke="var(--water)"
                    strokeWidth="4"
                    strokeDasharray="8 4"
                    className="animate-flow"
                  />
                )}
              </svg>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  "num text-lg font-semibold",
                  on ? "text-success" : "text-muted-foreground",
                )}
              >
                {hasSchedule ? (on ? p.kw : 0) : "—"}
              </div>
              <div className="text-[10px] uppercase text-muted-foreground">kW</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
