import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSim } from "@/lib/sim-store";
import { BackendScenarios } from "./backend-controls";
import { EnvironmentalSummary, CarbonPresentation } from "./carbon";
import { HamiltonWaterDashboard } from "./hamilton-water-data";
import { DemandChart, StorageChart } from "./charts";
import { HamiltonFacts, HamiltonSystem, HamiltonTransparency, HamiltonStrategy } from "./hamilton";
import { Gantt, InfeasiblePanel, OptimizeButton, Playback, ValidationPanel } from "./panels";
import { Btn, Panel, Tag } from "./ui";
import { PumpStation, Tank } from "./visuals";

const STAGES = [
  "Real Hamilton Infrastructure",
  "Water Pumping Challenge",
  "Engineering Simulation",
  "Live Optimization",
  "Operational Challenge",
  "Environmental Analysis",
];

export function HamiltonDemo({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState(0);
  const s = useSim();
  useEffect(() => {
    document.getElementById("hamilton-demo")?.scrollTo({ top: 0 });
  }, [stage]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.getElementById("hamilton-demo-exit")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const dialog = document.getElementById("hamilton-demo");
      const controls = dialog?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);
  const plan = s.opt?.feasible ? s.opt.plan : undefined;
  return (
    <div
      id="hamilton-demo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hamilton-demo-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-background"
    >
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-primary">Hamilton, Ontario · Illustrative case study</p>
            <h2 id="hamilton-demo-title" className="mt-1 text-2xl font-semibold">
              PEAKFIVE: Hamilton Case Study
            </h2>
          </div>
          <Btn id="hamilton-demo-exit" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
            Exit Demo
          </Btn>
        </header>
        <nav
          aria-label="Demonstration stages"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5"
        >
          {STAGES.map((name, i) => (
            <Btn
              key={name}
              variant={i === stage ? "active" : "ghost"}
              aria-current={i === stage ? "step" : undefined}
              onClick={() => setStage(i)}
              className="h-auto min-h-10 justify-start whitespace-normal py-2 text-left text-xs"
            >
              <span className="num text-primary">{i + 1}</span>
              {name}
            </Btn>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xl font-semibold">{STAGES[stage]}</h3>
          <Tag tone={stage === 0 ? "ok" : "warn"}>{stage === 0 ? "Verified Public Data · reporting year 2025" : "Engineering Simulation · not Hamilton operating telemetry"}</Tag>
        </div>
        {stage === 0 && (
          <>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Municipal utilities serve water requirements across extensive networks. Storage can
              offer flexibility in when pumping electricity is consumed; potential benefits depend
              on actual operating constraints and verified tariffs.
            </p>
            <HamiltonWaterDashboard compact />
            <HamiltonFacts />
          </>
        )}
        {stage === 1 && (
          <><HamiltonStrategy /><HamiltonTransparency /></>
        )}
        {stage === 2 && (
          <>
            <HamiltonSystem actions={false} />
            <HamiltonTransparency />
            <div className="grid gap-5 md:grid-cols-2">
              <Panel title="Simulated reservoir">
                <Tank />
              </Panel>
              <Panel title="Simulated pumps">
                <PumpStation />
              </Panel>
            </div>
          </>
        )}
        {stage === 3 && (
          <>
            <HamiltonSystem />
            <p className="text-sm text-muted-foreground">
              PEAKFIVE sends the current synthetic configuration and 96-slot water requirements to
              the Python scheduling service. Only a returned schedule passing independent checks is
              displayed.
            </p>
            <InfeasiblePanel />
            {plan && (
              <>
                <Panel title="Calculated pumping schedule">
                  <Gantt
                    combos={plan.combos}
                    levels={plan.eval.levels}
                    label="96 intervals · actual backend result"
                  />
                </Panel>
                <ValidationPanel validation={plan.validation} title="Returned schedule checks" />
                <EnvironmentalSummary />
                <Playback />
                <div className="grid gap-5 md:grid-cols-2"><Panel title="Simulated reservoir"><Tank /></Panel><Panel title="Calculated pump states"><PumpStation /></Panel></div>
                <Panel title="Calculated storage"><StorageChart /></Panel>
              </>
            )}
          </>
        )}
        {stage === 5 && (
          <>
            <p className="text-sm text-muted-foreground">Estimated emissions for the Hamilton-inspired synthetic water system — not actual City emissions or claimed savings.</p>
            <CarbonPresentation />
            {plan ? (
              <ValidationPanel validation={plan.validation} title="Returned schedule checks" />
            ) : (
              <p className="text-sm text-warning">
                No validated schedule available. Run optimization in Live Optimization.
              </p>
            )}
            <InfeasiblePanel />
          </>
        )}
        {stage === 4 && (
          <>
            <p className="text-sm text-muted-foreground">
              Explore how the simulated pumping system responds to changing operational
              requirements. Changes also apply to the main dashboard; no City equipment is
              controlled.
            </p>
            <BackendScenarios />
            <OptimizeButton label="Optimize Hamilton Scenario" />
            <InfeasiblePanel />
            {plan && (
              <>
                <Panel title="Recalculated pumping schedule">
                  <Gantt
                    combos={plan.combos}
                    levels={plan.eval.levels}
                    label="Actual calculated response"
                  />
                </Panel>
                <ValidationPanel validation={plan.validation} title="Returned schedule checks" />
                <EnvironmentalSummary />
              </>
            )}
          </>
        )}
        <footer className="flex justify-between border-t border-border pt-5">
          <Btn disabled={stage === 0} onClick={() => setStage(stage - 1)}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </Btn>
          {stage < 5 ? (
            <Btn variant="primary" onClick={() => setStage(stage + 1)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Btn>
          ) : (
            <Btn variant="primary" onClick={onClose}>
              Finish
            </Btn>
          )}
        </footer>
      </div>
    </div>
  );
}
