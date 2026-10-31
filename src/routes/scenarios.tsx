import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { BackendScenarios } from "@/components/pf/backend-controls";
import { DEFAULT_CONFIG } from "@/lib/engine";
import { useSim } from "@/lib/sim-store";
import { StorageChart } from "@/components/pf/charts";
import { Gantt, InfeasiblePanel, OptimizeButton, ValidationPanel } from "@/components/pf/panels";
import { Btn, NumField, PageHeader, Panel, Tag } from "@/components/pf/ui";

export const Route = createFileRoute("/scenarios")({
  head: () =>
    seo(
      "Scenario Simulator",
      "Break the system: fail pumps, raise reserves and move the risk window to test PEAKFIVE's feasibility checks.",
    ),
  component: Scenarios,
});

function Scenarios() {
  const s = useSim();
  if (s.mode === "backend")
    return (
      <div className="space-y-5">
        <PageHeader
          title="Test the Hamilton-Inspired Scenario"
          sub="Explore how the simulated pumping system responds to changing operational requirements."
          right={<OptimizeButton />}
        />
        <BackendScenarios />
        <InfeasiblePanel />
        <Panel title="Storage under this scenario">
          <StorageChart />
        </Panel>
        {s.opt?.feasible && s.opt.plan && (
          <>
            <Panel title="Backend schedule">
              <Gantt
                combos={s.opt.plan.combos}
                levels={s.opt.plan.eval.levels}
                label="ACTUAL BACKEND RESULT"
              />
            </Panel>
            <ValidationPanel validation={s.opt.plan.validation} title="Returned schedule checks" />
          </>
        )}
      </div>
    );
  const d = s.draft;
  const dirty = JSON.stringify(d) !== JSON.stringify(s.config);
  const o = s.opt?.feasible ? s.opt.plan : undefined;
  const challenges = [
    {
      label: "1 · Pump Failure",
      v: "danger" as const,
      run: () => s.runOptimize({ ...s.config, pump1: false }),
    },
    {
      label: "2 · Higher Reserve",
      v: "warn" as const,
      run: () =>
        s.runOptimize({ ...s.config, minReserve: Math.min(s.config.minReserve + 60, 400) }),
    },
    {
      label: "3 · Unexpected Peak",
      v: "warn" as const,
      run: () => s.runOptimize({ ...s.config, peakStart: 10, peakEnd: 14 }),
    },
    {
      label: "4 · Maximum Flexibility",
      v: "success" as const,
      run: () => s.runOptimize(DEFAULT_CONFIG),
    },
    {
      label: "5 · No Flexibility",
      v: "ghost" as const,
      run: () => s.runOptimize({ ...s.config, freeze: true }),
    },
  ];
  const noGain = o && s.config.freeze && o.eval.peakKwh === s.baseline.eval.peakKwh;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Scenario Simulator: Break the System"
        sub="Edit constraints, then Recalculate or Optimize. A reliable system rejects invalid schedules rather than always claiming savings."
      />
      <div className="flex flex-wrap gap-2">
        {challenges.map((c) => (
          <Btn key={c.label} variant={c.v} onClick={c.run} disabled={s.optimizing}>
            {c.label}
          </Btn>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Operating constraints"
          right={dirty ? <Tag tone="warn">Unapplied changes</Tag> : <Tag tone="ok">Applied</Tag>}
        >
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Initial tank level"
              unit="m³"
              value={d.initial}
              min={0}
              max={420}
              onChange={(n) => s.setDraft({ initial: n })}
            />
            <NumField
              label="Minimum reserve"
              unit="m³"
              value={d.minReserve}
              min={0}
              max={420}
              onChange={(n) => s.setDraft({ minReserve: n })}
            />
            <NumField
              label="Final storage"
              unit="m³"
              value={d.finalTarget}
              min={0}
              max={420}
              onChange={(n) => s.setDraft({ finalTarget: n })}
            />
            <div />
            <NumField
              label="Window start"
              unit="h"
              value={d.peakStart}
              min={0}
              max={23}
              onChange={(n) => s.setDraft({ peakStart: n, peakEnd: Math.max(n + 1, d.peakEnd) })}
            />
            <NumField
              label="Window end"
              unit="h"
              value={d.peakEnd}
              min={1}
              max={24}
              onChange={(n) => s.setDraft({ peakEnd: n, peakStart: Math.min(n - 1, d.peakStart) })}
            />
          </div>
          <div className="mt-4 space-y-3 text-sm">
            {(
              [
                ["pump1", "Pump 1 available"],
                ["pump2", "Pump 2 available"],
                ["freeze", "Freeze baseline schedule"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-center justify-between">
                {l}
                <button
                  type="button"
                  role="switch"
                  aria-checked={d[k]}
                  aria-label={l}
                  onClick={() => s.setDraft({ [k]: !d[k] })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${d[k] ? "bg-success" : "bg-idle"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-foreground transition-all ${d[k] ? "left-5" : "left-0.5"}`}
                  />
                </button>
              </label>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Toggles change simulation constraints only — never real equipment.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn onClick={() => s.recalculate()}>Recalculate</Btn>
            <OptimizeButton size="md" label="Optimize" />
          </div>
        </Panel>
        <div className="space-y-5 lg:col-span-2">
          <InfeasiblePanel />
          {noGain && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
              The current constraints do not permit rescheduling: pump states are frozen, so the
              optimizer returns the baseline unchanged.
            </div>
          )}
          <Panel title="Storage under this scenario">
            <StorageChart />
          </Panel>
          <Panel title="Schedules">
            <div className="space-y-5">
              <Gantt combos={s.baseline.combos} levels={s.baseline.eval.levels} label="Baseline" />
              {o && <Gantt combos={o.combos} levels={o.eval.levels} label="Optimized" />}
            </div>
          </Panel>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ValidationPanel validation={s.baseline.validation} title="Baseline check" />
        {s.opt?.plan && (
          <ValidationPanel validation={s.opt.plan.validation} title="Optimized check" />
        )}
      </div>
    </div>
  );
}
