import { Link } from "@tanstack/react-router";
import { Info, Leaf, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCarbon } from "@/lib/carbon-store";
import { allocateCarbon } from "@/lib/carbon";
import { peakContains } from "@/lib/peakfive-api";
import { useSim } from "@/lib/sim-store";
import { Btn, NumField, Panel, Tag } from "./ui";
import { Playback, Gantt } from "./panels";

const fmt = (n: number) => n.toLocaleString("en-CA", { maximumFractionDigits: 2 });
export function EnvironmentalSummary() {
  const c = useCarbon();
  const estimate = c.reply?.ok ? c.reply.estimate : null;
  return <section className="flex flex-wrap items-center justify-between gap-4 border-y border-success/30 py-5">
    <div><h2 className="flex items-center gap-2 font-semibold"><Leaf className="h-5 w-5 text-success" />Environmental Impact</h2>
      <p className="mt-2 text-sm">{c.energy ? `${c.options.includeBase ? "Facility" : "Pump"} energy: ${fmt(c.energy.kwh)} kWh` : "Awaiting a validated pumping schedule"}
        {estimate && ` · ${fmt(estimate.co2e)} kg CO₂e · Climatiq`}</p>
      <p className="mt-1 text-xs text-muted-foreground">{c.loading ? "Calculating with Climatiq…" : c.reply && !c.reply.ok ? c.reply.error : "Baseline comparison not available"}
        {c.options.multiplier !== 1 && " · Hypothetical scenario"}</p></div>
    <Link to="/carbon" className="inline-flex items-center gap-2 text-sm text-success">Explore Carbon Intelligence <span aria-hidden>→</span></Link>
  </section>;
}

export function CarbonDashboard() {
  const c = useCarbon();
  const s = useSim();
  const [view, setView] = useState<"energy" | "carbon">("energy");
  const [details, setDetails] = useState(false);
  const estimate = c.reply?.ok ? c.reply.estimate : null;
  const allocation = estimate && c.energy ? allocateCarbon(c.energy.intervals, estimate.co2e) : [];
  const rows = c.energy?.intervals.map((energy, slot) => ({ slot, energy, carbon: allocation[slot],
    time: `${String(Math.floor(slot / 4)).padStart(2, "0")}:${String(slot % 4 * 15).padStart(2, "0")}`,
    pumps: s.backendResult?.schedule[slot]?.pumps_on.join(", ") || "Off" })) ?? [];
  const status = c.loading ? "Calculating" : estimate ? "Verified API response" : c.reply ? "Unavailable" : "Awaiting schedule";
  const peakEnergy = c.energy?.intervals.reduce((sum, energy, slot) => sum + (peakContains(slot, s.config.peakStart * 4, s.config.peakEnd * 4) ? energy : 0), 0) ?? 0;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-2"><Tag tone={estimate ? "ok" : "warn"}>{status}</Tag><Tag>{s.status}</Tag>
      {estimate?.cached && <Tag>Cached estimate · exact accounting inputs</Tag>}
      {c.options.multiplier !== 1 && <Tag tone="warn">Hypothetical · {c.options.multiplier}× electricity</Tag>}
      <Btn size="sm" disabled={!c.hasSchedule || c.loading} onClick={c.refresh}><RefreshCw className="h-4 w-4" />Retry estimate</Btn></div>
    {c.reply && !c.reply.ok && <p role="alert" className="border-l-2 border-warning pl-4 text-sm text-warning">{c.reply.error}</p>}
    {estimate?.mismatch && <p role="alert" className="text-sm text-warning">Climatiq returned a different factor year or region: {estimate.years.join(", ")} · {estimate.regions.join(", ")}. This substitution is disclosed, not a matching-year Ontario estimate.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Panel title={c.options.includeBase ? "Daily Facility Energy" : "Daily Pump Energy"}><Zap className="mb-3 h-5 w-5 text-primary" /><p className="num text-2xl">{c.energy ? fmt(c.energy.kwh) : "—"} <span className="text-sm text-muted-foreground">kWh</span></p><p className="mt-2 text-xs text-muted-foreground">96 × 15 minutes · {c.options.includeBase ? "base load included" : "base load excluded"}</p></Panel>
      <Panel title="Estimated CO₂e Emissions"><Leaf className="mb-3 h-5 w-5 text-success" /><p className="num text-2xl text-success">{estimate ? fmt(estimate.co2e) : "—"} <span className="text-sm">kg CO₂e</span></p><p className="mt-2 text-xs text-muted-foreground">Location-based electricity emissions estimate</p></Panel>
      <Panel title="Carbon Impact of Optimization"><p className="text-lg">Comparison unavailable</p><p className="mt-3 text-xs text-muted-foreground">No independently validated backend baseline. No carbon savings claimed.</p></Panel>
      <Panel title="Emissions Data Source" right={<Btn size="icon" aria-label="Show source and methodology" title="Source and methodology" onClick={() => setDetails(!details)}><Info className="h-4 w-4" /></Btn>}>
        <p className="text-sm">Ontario, Canada · CA-ON</p><p className="mt-2 text-sm text-success">Climatiq Core</p><p className="mt-2 text-xs text-muted-foreground">Factor year: {estimate?.years.join(", ") ?? "Awaiting API"}<br />{estimate?.method ?? "Method pending"}</p></Panel>
    </div>
    <section className="border-y border-border py-5"><h2 className="mb-4 font-semibold">Explore Environmental Scenarios</h2>
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumField label="Electricity consumption multiplier" value={c.options.multiplier} min={0.1} max={3} step={0.1} unit="×" onChange={n => { if (n >= 0.1 && n <= 3) c.setOptions(o => ({ ...o, multiplier: n })); }} />
        <label className="text-xs text-muted-foreground">Electricity accounting year<select className="field mt-1 w-full" value={c.options.year ?? "latest"} onChange={e => c.setOptions(o => ({ ...o, year: e.target.value === "latest" ? null : Number(e.target.value) }))}><option value="latest">Latest available (API selected)</option>{Array.from({ length: 12 }, (_, i) => 2026 - i).map(year => <option key={year} value={year}>{year}{year === Number(s.date.slice(0, 4)) ? " · schedule year" : ""}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Pumping schedule<select className="field mt-1 w-full" aria-label="Pumping schedule selection" value="optimized" disabled><option value="optimized">Current validated optimized schedule</option><option disabled>Baseline unavailable</option></select></label>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={c.options.includeBase} onChange={e => c.setOptions(o => ({ ...o, includeBase: e.target.checked }))} />Include facility base load</label>
      </div><p className="mt-3 text-xs text-muted-foreground">Published annual-average factors, not real-time carbon intensity. Accounting scenarios do not change the pumping schedule.</p>
    </section>
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Electricity and Environmental Impact</h2><div className="flex gap-2"><Btn size="sm" variant={view === "energy" ? "active" : "ghost"} onClick={() => setView("energy")}>Energy View</Btn><Btn size="sm" variant={view === "carbon" ? "active" : "ghost"} disabled={!estimate} onClick={() => setView("carbon")}>Carbon View</Btn></div></div>
      {!c.hasSchedule ? <div className="flex h-64 items-center justify-center border-y border-border text-sm text-muted-foreground">Calculate a feasible schedule to see electricity and emissions.</div> : <>
        {view === "carbon" && <p className="mb-4 text-xs text-warning">Estimated interval emissions using an annual-average factor. Not actual hourly grid carbon intensity.</p>}
        <div className="h-72 min-w-0"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis type="number" dataKey="slot" domain={[0, 95]} ticks={[0, 16, 32, 48, 64, 80, 95]} tickFormatter={n => `${String(Math.floor(n / 4)).padStart(2, "0")}:${n % 4 === 0 ? "00" : "45"}`} stroke="var(--muted-foreground)" /><YAxis stroke="var(--muted-foreground)" width={65} />
          <Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload; return active && row ? <div className="rounded-lg border border-border bg-popover p-3 text-xs"><p>{row.time} · {row.pumps}</p><p>{fmt(view === "energy" ? row.energy : row.carbon)} {view === "energy" ? "kWh" : "kg CO₂e"}</p></div> : null; }} />
          {(s.config.peakStart < s.config.peakEnd ? [[s.config.peakStart * 4, s.config.peakEnd * 4]] : s.config.peakStart > s.config.peakEnd ? [[0, s.config.peakEnd * 4], [s.config.peakStart * 4, 96]] : []).map(([start, end]) => <ReferenceArea key={start} x1={start} x2={end} fill="var(--destructive)" fillOpacity={0.12} />)}
          <Area type="stepAfter" dataKey={view} stroke={view === "energy" ? "var(--primary)" : "var(--success)"} fill={view === "energy" ? "var(--primary)" : "var(--success)"} fillOpacity={0.12} isAnimationActive={false} /><ReferenceLine x={s.step} stroke="var(--foreground)" strokeDasharray="4 4" /></AreaChart></ResponsiveContainer></div>
        <Playback /><Gantt combos={s.active.combos} levels={s.active.eval.levels} label="Validated pumping schedule" />
      </>}
    </section>
    <section className="grid gap-6 border-y border-border py-5 lg:grid-cols-2"><div><h2 className="mb-3 font-semibold">Baseline vs PEAKFIVE Optimized Schedule</h2><p className="text-sm text-muted-foreground">Baseline comparison not available. The backend supplies an optimized schedule, not a validated baseline; a before/after carbon chart would imply unsupported savings.</p></div><div><h2 className="mb-3 font-semibold">What Does This Mean?</h2><p className="text-sm text-muted-foreground">{c.energy ? `${fmt(peakEnergy)} kWh falls in the selected risk window. ${estimate ? `The selected electricity quantity accounts for ${fmt(estimate.co2e)} kg CO₂e under Climatiq’s published factor.` : "Its carbon footprint is awaiting a verified Climatiq estimate."}` : "Environmental accounting begins with a complete, validated pumping schedule."}</p><p className="mt-3 text-sm text-muted-foreground">Under the same annual-average factor, shifting consumption between hours without reducing total kWh does not create a calculated emissions reduction.</p></div></section>
    <section><h2 className="mb-3 font-semibold">Calculation Methodology</h2><p className="text-sm text-muted-foreground">{c.options.includeBase ? "Facility kWh = Σ(schedule kW × 0.25 h)." : "Pump kWh = Σ((schedule kW − base load kW) × 0.25 h)."} Location-based Scope 2 uses Climatiq location.consumption.co2e in kilograms. {c.options.multiplier !== 1 && `A hypothetical ${c.options.multiplier}× multiplier is applied.`}</p>
      <p className="mt-2 text-xs text-muted-foreground">Requested year: {c.options.year ?? "latest available, selected explicitly"} · Schedule year: {s.date.slice(0, 4)} · Factor year: {estimate?.years.join(", ") ?? "not returned yet"}. {estimate && estimate.years.some(year => year !== s.date.slice(0, 4)) && "The published factor year differs from the schedule year."}</p>
      <Btn size="sm" className="mt-3" onClick={() => setDetails(!details)}><Info className="h-4 w-4" />{details ? "Hide" : "Full"} source trail</Btn>
      {details && <div className="mt-4 space-y-3 text-sm text-muted-foreground">{estimate ? <><p>{estimate.method} · calculated {estimate.calculatedAt} · {estimate.cached ? "cached" : "live API"}</p>{estimate.sources.map((source, i) => <p key={i} className="break-words border-l-2 border-success/40 pl-3">{source.name} · {source.source} · {source.source_dataset}<br />{source.region_name ?? source.region} · {source.year ?? "year not specified"} · {source.data_category}</p>)}<h3 className="font-semibold">API notices</h3>{estimate.notices.length ? estimate.notices.map((notice, i) => <p key={i}>{notice.code} {notice.message} {notice.severity}</p>) : <p>No API notices returned.</p>}</> : <p>Source and methodology details appear only after a verified API response.</p>}</div>}
    </section>
  </div>;
}

export function CarbonPresentation() {
  return <div className="space-y-5"><h2 className="text-3xl font-semibold">Beyond Electricity Costs</h2><p className="text-muted-foreground">Understanding the environmental implications of smarter water infrastructure.</p><EnvironmentalSummary /><CarbonDashboard /><p className="text-sm text-warning">PEAKFIVE optimizes when electricity is consumed. Actual carbon reductions depend on changes in electricity consumption and grid emissions intensity.</p></div>;
}