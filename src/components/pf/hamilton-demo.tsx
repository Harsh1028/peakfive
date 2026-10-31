import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSim } from "@/lib/sim-store";
import { BackendScenarios } from "./backend-controls";
import { EnvironmentalSummary } from "./carbon";
import { DemandChart, StorageChart } from "./charts";
import { HamiltonFacts, HamiltonSystem, HamiltonTransparency, HamiltonStrategy } from "./hamilton";
import { Gantt, InfeasiblePanel, OptimizeButton, Playback, ValidationPanel } from "./panels";
import { Btn, Panel, Tag } from "./ui";
import { PumpStation, Tank } from "./visuals";

const STAGES = ["Hamilton's Challenge", "Our Simulated System", "Intelligent Scheduling", "Operational Reliability", "Operational Challenge"];

export function HamiltonDemo({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState(0);
  const s = useSim();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.getElementById("hamilton-demo-exit")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const dialog = document.getElementById("hamilton-demo");
      const controls = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); if (previous instanceof HTMLElement) previous.focus(); };
  }, [onClose]);
  const plan = s.opt?.feasible ? s.opt.plan : undefined;
  return (
    <div id="hamilton-demo" role="dialog" aria-modal="true" aria-labelledby="hamilton-demo-title" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-primary">Hamilton, Ontario · Illustrative case study</p><h2 id="hamilton-demo-title" className="mt-1 text-2xl font-semibold">PEAKFIVE: Hamilton Case Study</h2></div><Btn id="hamilton-demo-exit" size="sm" onClick={onClose}><X className="h-4 w-4" />Exit Demo</Btn></header>
        <nav aria-label="Demonstration stages" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">{STAGES.map((name, i) => <Btn key={name} variant={i === stage ? "active" : "ghost"} aria-current={i === stage ? "step" : undefined} onClick={() => setStage(i)} className="h-auto min-h-10 justify-start whitespace-normal py-2 text-left text-xs"><span className="num text-primary">{i + 1}</span>{name}</Btn>)}</nav>
        <div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-semibold">{STAGES[stage]}</h3><Tag tone="warn">Synthetic water system · actual Python calculations</Tag></div>
        {stage === 0 && <><p className="max-w-3xl text-sm text-muted-foreground">Municipal utilities serve water requirements across extensive networks. Storage can offer flexibility in when pumping electricity is consumed; potential benefits depend on actual operating constraints and verified tariffs.</p><HamiltonFacts /><Panel title="Ontario electricity-demand context" sub="Verified IESO measurements when available; otherwise explicitly illustrative."><DemandChart height={240} /></Panel></>}
        {stage === 1 && <><HamiltonSystem actions={false} /><HamiltonTransparency /><div className="grid gap-5 md:grid-cols-2"><Panel title="Simulated reservoir"><Tank /></Panel><Panel title="Simulated pumps"><PumpStation /></Panel></div></>}
        {stage === 2 && <><HamiltonSystem /><p className="text-sm text-muted-foreground">PEAKFIVE sends the current synthetic configuration and 96-slot water requirements to the Python scheduling service. Only a returned schedule passing independent checks is displayed.</p><InfeasiblePanel />{plan && <><Panel title="Calculated pumping schedule"><Gantt combos={plan.combos} levels={plan.eval.levels} label="96 intervals · actual backend result" /></Panel><ValidationPanel validation={plan.validation} title="Returned schedule checks" /><EnvironmentalSummary /></>}</>}
        {stage === 3 && <><Playback /><div className="grid gap-5 md:grid-cols-2"><Panel title="Reservoir water balance"><Tank /></Panel><Panel title="Pump ON/OFF states"><PumpStation /></Panel></div><Panel title="Calculated storage through the day"><StorageChart /></Panel><HamiltonStrategy />{plan ? <ValidationPanel validation={plan.validation} title="Returned schedule checks" /> : <p className="text-sm text-warning">No validated schedule available. Run optimization in Intelligent Scheduling.</p>}<InfeasiblePanel /></>}
        {stage === 4 && <><p className="text-sm text-muted-foreground">Explore how the simulated pumping system responds to changing operational requirements. Changes also apply to the main dashboard; no City equipment is controlled.</p><BackendScenarios /><OptimizeButton label="Optimize Hamilton Scenario" /><InfeasiblePanel />{plan && <><Panel title="Recalculated pumping schedule"><Gantt combos={plan.combos} levels={plan.eval.levels} label="Actual calculated response" /></Panel><ValidationPanel validation={plan.validation} title="Returned schedule checks" /><EnvironmentalSummary /></>}</>}
        <footer className="flex justify-between border-t border-border pt-5"><Btn disabled={stage === 0} onClick={() => setStage(stage - 1)}><ChevronLeft className="h-4 w-4" />Back</Btn>{stage < 4 ? <Btn variant="primary" onClick={() => setStage(stage + 1)}>Next<ChevronRight className="h-4 w-4" /></Btn> : <Btn variant="primary" onClick={onClose}>Finish</Btn>}</footer>
      </div>
    </div>
  );
}