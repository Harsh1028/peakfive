import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { stepLabel, type Evaluation } from "@/lib/engine";
import { useSim } from "@/lib/sim-store";

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false };
const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--foreground)" },
};

export function DemandChart({ height = 300 }: { height?: number }) {
  const { dataset, config, step } = useSim();
  const data = [...dataset.hourly.map((v, h) => ({ h, mw: v })), { h: 24, mw: dataset.hourly[23] }];
  const ici = dataset.date === "2026-07-14";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mwG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity={0.45} />
            <stop offset="1" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="h"
          type="number"
          domain={[0, 24]}
          ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]}
          tickFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
          {...axis}
        />
        <YAxis
          {...axis}
          width={56}
          domain={["dataMin - 1000", "dataMax + 1000"]}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          {...tip}
          labelFormatter={(h) =>
            `Hour ending ${Number(h) + 1} (${String(h).padStart(2, "0")}:00–${String(Number(h) + 1).padStart(2, "0")}:00)`
          }
          formatter={(v: number) => [`${v.toLocaleString()} MW`, "Ontario Demand"]}
        />
        <ReferenceArea
          x1={config.peakStart}
          x2={config.peakStart > config.peakEnd ? 24 : config.peakEnd}
          fill="var(--destructive)"
          fillOpacity={0.14}
          label={{
            value: "Risk window",
            position: "insideTop",
            fill: "var(--destructive)",
            fontSize: 11,
          }}
        />
        <Area
          type="stepAfter"
          dataKey="mw"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#mwG)"
        />
        {ici && (
          <ReferenceLine
            x={16}
            stroke="var(--warning)"
            strokeDasharray="3 3"
            label={{
              value: "ICI peak HE17",
              position: "top",
              fill: "var(--warning)",
              fontSize: 10,
            }}
          />
        )}
        {config.peakStart > config.peakEnd && (
          <ReferenceArea x1={0} x2={config.peakEnd} fill="var(--destructive)" fillOpacity={0.1} />
        )}
        <ReferenceLine x={step / 4} stroke="var(--foreground)" strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StorageChart({ height = 220 }: { height?: number }) {
  const { baseline, opt, config, step, mode, capacity, hasSchedule, comparisonBaseline } = useSim();
  if (!hasSchedule)
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Awaiting a backend schedule
      </div>
    );
  const o = opt?.feasible ? opt.plan?.eval : undefined;
  const data = (mode === "backend" && o ? o : baseline.eval).levels.map((v, t) => ({
    t,
    base: mode === "demo" || comparisonBaseline ? baseline.eval.levels[t] : undefined,
    opt: o?.levels[t],
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[0, 96]}
          ticks={[0, 16, 32, 48, 64, 80, 96]}
          tickFormatter={(t) => stepLabel(t)}
          {...axis}
        />
        <YAxis {...axis} width={44} domain={[0, capacity]} unit="" />
        <Tooltip
          {...tip}
          labelFormatter={(t) => stepLabel(Number(t))}
          formatter={(v: number, n) => [`${v} m³`, n === "base" ? "Baseline" : "Optimized"]}
        />
        <ReferenceArea
          x1={config.peakStart * 4}
          x2={config.peakStart > config.peakEnd ? 96 : config.peakEnd * 4}
          fill="var(--destructive)"
          fillOpacity={0.1}
        />
        <ReferenceLine y={config.minReserve} stroke="var(--destructive)" strokeDasharray="4 4" />
        <ReferenceLine y={capacity} stroke="var(--muted-foreground)" strokeDasharray="2 4" />
        {config.peakStart > config.peakEnd && (
          <ReferenceArea
            x1={0}
            x2={config.peakEnd * 4}
            fill="var(--destructive)"
            fillOpacity={0.1}
          />
        )}
        <ReferenceLine x={step} stroke="var(--foreground)" />
        {(mode === "demo" || comparisonBaseline) && (
          <Line
            dataKey="base"
            stroke="var(--muted-foreground)"
            dot={false}
            strokeWidth={2}
            type="linear"
          />
        )}
        {o && (
          <Line dataKey="opt" stroke="var(--primary)" dot={false} strokeWidth={2.5} type="linear" />
        )}
        <Legend
          formatter={(v) => (v === "base" ? "Baseline storage (m³)" : "Optimized storage (m³)")}
          wrapperStyle={{ fontSize: 11 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WaterBalanceChart({ height = 220 }: { height?: number }) {
  const { active, step, demand, hasSchedule, config } = useSim();
  if (!hasSchedule)
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Awaiting a backend schedule
      </div>
    );
  const data = demand.map((d, t) => ({ t, demand: d, pumped: active.eval.pumped[t] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[0, 95]}
          ticks={[0, 16, 32, 48, 64, 80]}
          tickFormatter={(t) => stepLabel(t)}
          {...axis}
        />
        <YAxis {...axis} width={36} />
        <Tooltip
          {...tip}
          labelFormatter={(t) => stepLabel(Number(t))}
          formatter={(v: number, n) => [`${v} m³`, n === "demand" ? "Consumption" : "Production"]}
        />
        <Bar dataKey="pumped" fill="var(--primary)" fillOpacity={0.55} />
        <Line
          dataKey="demand"
          stroke="var(--warning)"
          dot={false}
          strokeWidth={2}
          type="stepAfter"
        />
        {config.peakStart > config.peakEnd && (
          <ReferenceArea
            x1={0}
            x2={config.peakEnd * 4}
            fill="var(--destructive)"
            fillOpacity={0.1}
          />
        )}
        <ReferenceLine x={step} stroke="var(--foreground)" />
        <Legend
          formatter={(v) =>
            v === "demand" ? "Consumption (m³ / 15 min)" : "Production (m³ / 15 min)"
          }
          wrapperStyle={{ fontSize: 11 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function PeakCompareChart({
  base,
  opt,
  height = 220,
}: {
  base: Evaluation;
  opt?: Evaluation;
  height?: number;
}) {
  const data = [
    { name: "Risk-window kWh", Baseline: base.peakKwh, Optimized: opt?.peakKwh },
    { name: "Daily kWh", Baseline: base.dailyKwh, Optimized: opt?.dailyKwh },
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" {...axis} />
        <YAxis {...axis} width={44} />
        <Tooltip
          {...tip}
          formatter={(v: number) => `${v.toFixed(1)} kWh`}
          cursor={{ fill: "var(--accent)", opacity: 0.3 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Baseline" fill="var(--muted-foreground)" radius={[6, 6, 0, 0]} />
        {opt && <Bar dataKey="Optimized" fill="var(--primary)" radius={[6, 6, 0, 0]} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LoadChart({ height = 200 }: { height?: number }) {
  const { baseline, opt, config, mode, hasSchedule, comparisonBaseline } = useSim();
  if (!hasSchedule)
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Awaiting a backend schedule
      </div>
    );
  const o = opt?.feasible ? opt.plan?.eval : undefined;
  const data = (mode === "backend" && o ? o : baseline.eval).kw.map((k, t) => ({
    t,
    base: mode === "demo" || comparisonBaseline ? baseline.eval.kw[t] : undefined,
    opt: o?.kw[t],
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[0, 95]}
          ticks={[0, 16, 32, 48, 64, 80]}
          tickFormatter={(t) => stepLabel(t)}
          {...axis}
        />
        <YAxis {...axis} width={36} />
        <Tooltip
          {...tip}
          labelFormatter={(t) => stepLabel(Number(t))}
          formatter={(v: number, n) => [`${v} kW`, n === "base" ? "Baseline" : "Optimized"]}
        />
        <ReferenceArea
          x1={config.peakStart * 4}
          x2={config.peakStart > config.peakEnd ? 96 : config.peakEnd * 4}
          fill="var(--destructive)"
          fillOpacity={0.12}
        />
        {(mode === "demo" || comparisonBaseline) && (
          <Area
            type="stepAfter"
            dataKey="base"
            stroke="var(--muted-foreground)"
            fill="var(--muted-foreground)"
            fillOpacity={0.15}
          />
        )}
        {o && (
          <Area
            type="stepAfter"
            dataKey="opt"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.25}
          />
        )}
        <Legend
          formatter={(v) =>
            v === "base"
              ? mode === "backend"
                ? "Simulated baseline site load (kW)"
                : "Baseline pump load (kW)"
              : mode === "backend"
                ? "Simulated optimized site load (kW)"
                : "Optimized pump load (kW)"
          }
          wrapperStyle={{ fontSize: 11 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
