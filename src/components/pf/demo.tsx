import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import { DEFAULT_CONFIG } from "@/lib/engine";
import { useSim } from "@/lib/sim-store";
import { cn } from "@/lib/utils";
import { DemandChart, PeakCompareChart, StorageChart } from "./charts";
import { Explanation, Gantt, InfeasiblePanel, OptimizeButton, Playback, ValidationPanel } from "./panels";
import { Btn } from "./ui";
import { PumpStation, Tank } from "./visuals";

const STAGES = ["The Challenge", "The Existing System", "PEAKFIVE Optimization", "The Results", "Challenge PEAKFIVE"];

export function DemoMode({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const s = useSim();
  const restart = () => { s.recalculate(DEFAULT_CONFIG); s.setStep(56); setI(0); };
  const o = s.opt?.feasible ? s.opt.plan : undefined;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {STAGES.map((n, k) => (
            <button key={n} onClick={() => setI(k)} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs", k === i ? "border-primary bg-primary/15 text-primary" : k < i ? "border-success/40 text-success" : "border-border text-muted-foreground")}>
              <span className="num">{k + 1}</span>{n}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <Btn size="sm" onClick={restart}><RotateCcw className="h-4 w-4" />Restart Demo</Btn>
            <Btn size="sm" variant="danger" onClick={onClose}><X className="h-4 w-4" />Exit Demo</Btn>
          </div>
        </div>

        <p className="mb-2 text-sm text-warning">Frontend-only demo simulation — not backend results</p>
        <h2 className="text-3xl font-semibold">{STAGES[i]}</h2>
        <div className="mt-6 space-y-5">
          {i === 0 && (<>
            <p className="max-w-3xl text-muted-foreground">Ontario demand climbs through the afternoon. Electricity used during critical high-demand hours can cost more. Water utilities have storage — so flexible pumping can potentially move away from those hours.</p>
            <div className="panel p-4"><DemandChart height={340} /></div>
          </>)}
          {i === 1 && (<>
            <p className="max-w-3xl text-muted-foreground">A traditional controller switches pumps on storage bands. It pumps whenever the tank runs low — including inside the red risk window.</p>
            <Playback />
            <div className="grid gap-5 md:grid-cols-2"><div className="panel p-5"><Tank /></div><div className="panel p-5"><PumpStation /></div></div>
            <div className="panel p-4"><Gantt combos={s.baseline.combos} levels={s.baseline.eval.levels} label="BEFORE: Traditional pump scheduling" /></div>
          </>)}
          {i === 2 && (<>
            <p className="max-w-3xl text-muted-foreground">PEAKFIVE evaluates every pump combination across all 96 fifteen-minute intervals with exact dynamic programming, then an independent checker re-verifies the result.</p>
            <OptimizeButton />
            {o && <div className="panel p-4"><Gantt combos={o.combos} levels={o.eval.levels} label="AFTER: PEAKFIVE optimized scheduling" /></div>}
            <InfeasiblePanel />
          </>)}
          {i === 3 && (o ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="panel p-4"><PeakCompareChart base={s.baseline.eval} opt={o.eval} /></div>
              <div className="panel p-5"><h3 className="mb-3 font-semibold">What changed</h3><Explanation /><p className="mt-3 text-xs text-muted-foreground">Water delivered is unchanged: 1,082 m³ in both schedules.</p></div>
              <div className="panel p-4"><StorageChart /></div>
              <ValidationPanel validation={o.validation} />
            </div>
          ) : <p className="text-muted-foreground">Go back to stage 3 and run the optimizer first.</p>)}
          {i === 4 && (<>
            <p className="max-w-3xl text-muted-foreground">Try to break it. PEAKFIVE rejects schedules it cannot prove are valid.</p>
            <div className="flex flex-wrap gap-2">
              <Btn variant="danger" onClick={() => s.runOptimize({ ...s.config, pump1: false, freeze: false })}>Fail Pump 1</Btn>
              <Btn variant="warn" onClick={() => s.runOptimize({ ...s.config, minReserve: 160, freeze: false })}>Raise reserve to 160 m³</Btn>
              <Btn variant="success" onClick={() => s.runOptimize(DEFAULT_CONFIG)}>Restore</Btn>
            </div>
            <InfeasiblePanel />
            {s.opt?.feasible && s.opt.plan && <div className="grid gap-5 lg:grid-cols-2"><div className="panel p-4"><Gantt combos={s.opt.plan.combos} levels={s.opt.plan.eval.levels} label="Recalculated schedule" /></div><ValidationPanel validation={s.opt.plan.validation} /></div>}
          </>)}
        </div>

        <div className="mt-8 flex justify-between">
          <Btn disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft className="h-4 w-4" />Back</Btn>
          {i < 4 ? <Btn variant="primary" onClick={() => setI(i + 1)}>Next<ChevronRight className="h-4 w-4" /></Btn> : <Btn variant="primary" onClick={onClose}>Finish</Btn>}
        </div>
      </div>
    </div>
  );
}
