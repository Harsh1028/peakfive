import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useSim } from "@/lib/sim-store";
import { Btn, Panel, Tag } from "./ui";
import { Gantt } from "./panels";

export function CompareButton() {
  const s = useSim();
  if (s.mode !== "backend") return null;
  return (
    <Btn size="lg" disabled={s.optimizing} onClick={() => void s.runCompare()}>
      {s.comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
      {s.comparing ? "Comparing schedules…" : "Compare Schedules"}
    </Btn>
  );
}

export function ComparisonDashboard({ timelines = false }: { timelines?: boolean }) {
  const s = useSim();
  if (s.mode !== "backend") return null;
  const r = s.comparison;
  const available = r?.status === "comparison_available" && s.comparisonBaseline && s.opt?.plan;
  return (
    <div className="space-y-5" aria-busy={s.comparing}>
      {s.comparing && (
        <div role="status" className="flex items-center gap-3 border border-primary/30 bg-primary/10 p-4 text-sm">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          Calculating both simulated schedules. Render’s free tier may take over 50 seconds to wake up; waiting up to 180 seconds.
        </div>
      )}
      <Panel title="Baseline vs optimized peak demand" right={<Tag tone="warn">Simulated comparison</Tag>}>
        <p className="text-xs text-warning">
          {r?.label ?? "Simulated municipal water infrastructure — not measured Hamilton municipal operations or verified financial savings."}
        </p>
        <div className="num mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            ["Baseline peak demand", available ? r?.peak_window?.baseline_kw : null, "kW"],
            ["Optimized peak demand", available ? r?.peak_window?.optimized_kw : null, "kW"],
            ["Peak-demand reduction", available ? r?.peak_window?.reduction_pct : null, "%"],
          ].map(([label, value, unit]) => (
            <div key={String(label)}>
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-primary">
                {typeof value === "number" ? value.toFixed(2) : "—"} <span className="text-sm text-muted-foreground">{unit}</span>
              </div>
            </div>
          ))}
        </div>
        {available && r?.peak_window && (
          <p className="num mt-3 text-sm">Baseline minus optimized: {r.peak_window.reduction_kw.toFixed(2)} kW</p>
        )}
        {r ? (
          <div role={available ? "status" : "alert"} className="mt-4 text-sm">
            <p className={available ? "text-muted-foreground" : "text-warning"}>
              {!available && (r.status === "comparison_unavailable" ? "Comparison unavailable. " : r.status === "invalid_input" ? "Invalid comparison inputs. " : "Comparison request failed. ")}
              {r.explanation}
            </p>
            {r.optimized?.status === "feasible_timeout" && <p className="mt-2 text-warning">Optimized schedule is feasible, not proven optimal.</p>}
          </div>
        ) : !s.comparing && <p className="mt-4 text-sm text-muted-foreground">No comparison requested.</p>}
        {r?.energy && available && (
          <div className="mt-4 border-t border-border pt-4 text-sm">
            <div className="num">Simulated pump energy: {r.energy.baseline_pump_kwh.toFixed(1)} → {r.energy.optimized_pump_kwh.toFixed(1)} kWh</div>
            <p className="mt-2 text-xs text-warning">{r.energy.note}</p>
          </div>
        )}
        {r && (
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Assumptions and limitations</summary>
            <ul className="mt-2 list-disc space-y-2 pl-5">{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
            {r.baseline?.label && <p className="mt-3">{r.baseline.label}</p>}
            {!available && [r.baseline, r.optimized].map((schedule, i) => schedule?.violations.length ? (
              <div key={i} className="mt-3"><p>{i === 0 ? "Baseline" : "Optimized"} validation:</p><ul className="list-disc pl-5">{schedule.violations.map((v) => <li key={v}>{v}</li>)}</ul></div>
            ) : null)}
          </details>
        )}
      </Panel>
      {timelines && available && s.comparisonBaseline && s.opt?.plan && (
        <Panel title="Baseline and optimized pump schedules">
          <div className="space-y-6">
            <Gantt label="SIMULATED BASELINE · CONVENTIONAL CONTROL" combos={s.comparisonBaseline.combos} levels={s.comparisonBaseline.eval.levels} schedule={r?.baseline?.schedule} />
            <Gantt label="SIMULATED OPTIMIZED · PEAKFIVE" combos={s.opt.plan.combos} levels={s.opt.plan.eval.levels} schedule={r?.optimized?.schedule} />
          </div>
        </Panel>
      )}
    </div>
  );
}