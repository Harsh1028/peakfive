import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { useSim } from "@/lib/sim-store";
import { LoadChart, PeakCompareChart } from "@/components/pf/charts";
import { Explanation, Gantt, InfeasiblePanel, OptimizeButton, Playback, ValidationPanel } from "@/components/pf/panels";
import { PageHeader, Panel } from "@/components/pf/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/optimizer")({
  head: () => seo("Schedule Optimizer", "Compare traditional pump scheduling against PEAKFIVE's exact dynamic-programming schedule with independent validation."),
  component: Optimizer,
});

function Optimizer() {
  const { baseline, opt, view, setView, config } = useSim();
  const o = opt?.feasible ? opt.plan : undefined;
  const reduction = o ? baseline.eval.peakKwh - o.eval.peakKwh : 0;
  const avgKw = (k: number) => k / (config.peakEnd - config.peakStart);
  return (
    <div className="space-y-5">
      <PageHeader title="Schedule Optimizer" sub="Exact discrete dynamic programming over storage and pump states. Four pump combinations × 96 intervals." right={<OptimizeButton />} />
      <div className="grid gap-4 md:grid-cols-2">
        {(["baseline", "optimized"] as const).map((v) => (
          <button key={v} disabled={v === "optimized" && !o} onClick={() => setView(v)}
            className={cn("panel p-5 text-left transition-all disabled:opacity-50", view === v && "glow")}>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{v === "baseline" ? "Before" : "After"}</div>
            <div className="mt-1 text-lg font-semibold">{v === "baseline" ? "Traditional Pump Scheduling" : "PEAKFIVE Optimized Scheduling"}</div>
            <div className="num mt-2 text-sm text-muted-foreground">
              {v === "baseline" ? `${baseline.eval.peakKwh.toFixed(1)} kWh in window · ${baseline.eval.dailyKwh.toFixed(0)} kWh/day` : o ? `${o.eval.peakKwh.toFixed(1)} kWh in window · ${o.eval.dailyKwh.toFixed(0)} kWh/day` : "Not yet calculated"}
            </div>
          </button>
        ))}
      </div>
      <InfeasiblePanel />
      <Playback />
      <Panel title="Pump timelines" sub="Green = ON · grey = OFF · red outline = risk window · click a cell to jump there">
        <div className="space-y-6">
          <Gantt combos={baseline.combos} levels={baseline.eval.levels} label="BEFORE" />
          {o && <Gantt combos={o.combos} levels={o.eval.levels} label="AFTER" />}
        </div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Energy comparison" sub="Calculated from the actual pump states">
          <PeakCompareChart base={baseline.eval} opt={o?.eval} />
          {o && baseline.validation.pass && (
            <div className="num mt-3 grid grid-cols-3 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Shifted out of window</div><div className="text-lg text-success">{reduction.toFixed(1)} kWh</div></div>
              <div><div className="text-xs text-muted-foreground">Avg window load</div><div className="text-lg">{avgKw(baseline.eval.peakKwh).toFixed(1)} → {avgKw(o.eval.peakKwh).toFixed(1)} kW</div></div>
              <div><div className="text-xs text-muted-foreground">Daily total</div><div className="text-lg">{o.eval.dailyKwh < baseline.eval.dailyKwh ? `−${(baseline.eval.dailyKwh - o.eval.dailyKwh).toFixed(1)} kWh` : "No total saving"}</div></div>
            </div>
          )}
        </Panel>
        <Panel title="Why the schedule changed"><Explanation /></Panel>
      </div>
      <Panel title="Pump load profile"><LoadChart /></Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <ValidationPanel validation={baseline.validation} title="Baseline constraint check" />
        {o ? <ValidationPanel validation={o.validation} title="Optimized constraint check" /> : <Panel title="Optimized constraint check"><p className="text-sm text-muted-foreground">No optimized schedule yet.</p></Panel>}
      </div>
      <Panel title="Sustainability impact">
        {o ? (
          <ul className="space-y-2 text-sm">
            <li>Peak demand reduction: average pump load in the window changes by <b className="num">{(avgKw(baseline.eval.peakKwh) - avgKw(o.eval.peakKwh)).toFixed(1)} kW</b>.</li>
            <li>Electricity shifted outside the window: <b className="num">{reduction.toFixed(1)} kWh</b>.</li>
            <li>Total daily consumption: <b className="num">{baseline.eval.dailyKwh.toFixed(1)} → {o.eval.dailyKwh.toFixed(1)} kWh</b>{o.eval.dailyKwh < baseline.eval.dailyKwh ? " (lower total)" : " — no total electricity saving is claimed"}.</li>
            <li className="text-muted-foreground">No carbon reduction is claimed: shifting use between hours needs verified hourly emissions-intensity data.</li>
          </ul>
        ) : <p className="text-sm text-muted-foreground">Run the optimizer to compute impact metrics.</p>}
      </Panel>
    </div>
  );
}
