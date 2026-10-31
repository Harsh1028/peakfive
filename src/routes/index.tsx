import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BackendSettings } from "@/components/pf/backend-controls";
import { Presentation } from "lucide-react";
import { seo } from "@/lib/seo";
import { DemandChart, StorageChart } from "@/components/pf/charts";
import { HamiltonDemo } from "@/components/pf/hamilton-demo";
import { HamiltonFacts, HamiltonOverview } from "@/components/pf/hamilton";
import {
  DataControls,
  IllustrativeBanner,
  InfeasiblePanel,
  KpiCards,
  OptimizeButton,
  Playback,
} from "@/components/pf/panels";
import { Btn, Panel } from "@/components/pf/ui";
import { PumpStation, Tank } from "@/components/pf/visuals";
import { EnvironmentalSummary } from "@/components/pf/carbon";
import { HamiltonViewModes } from "@/components/pf/hamilton-water-data";

export const Route = createFileRoute("/")({
  head: () =>
    seo(
      "Overview Dashboard",
      "Live view of Ontario grid demand, reservoir storage and pump schedules for smarter municipal water pumping.",
    ),
  component: Overview,
});

function Overview() {
  const [demo, setDemo] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            Municipal Water &amp; Energy Intelligence
          </p>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">
            Smarter Pumping. Lower Peak Costs.
            <br className="hidden md:block" /> Reliable Water Service.
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn size="lg" variant="primary" onClick={() => setDemo(true)}>
            <Presentation className="h-5 w-5" />
            Start Demo
          </Btn>
          <OptimizeButton />
        </div>
      </div>
      <HamiltonOverview />
      <HamiltonViewModes />
      <p className="text-xs text-warning">
        Engineering Simulation · synthetic pump and tank inputs; calculated schedules are not
        measured Hamilton operations.
      </p>
      <IllustrativeBanner />
      <BackendSettings />
      <InfeasiblePanel />
      <KpiCards />
      <EnvironmentalSummary />
      <Playback />
      <div className="grid gap-5 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title="Ontario Electricity Demand"
          sub="Hourly Ontario Demand (MW), selected risk window in red"
          right={<DataControls />}
        >
          <DemandChart />
        </Panel>
        <Panel
          className="xl:col-span-2"
          title="Reservoir digital twin"
          sub="Level calculated from the active schedule"
          right={
            <Link to="/twin" className="text-xs text-primary">
              Open twin →
            </Link>
          }
        >
          <Tank />
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-5">
        <Panel className="xl:col-span-2" title="Pumping station">
          <PumpStation />
        </Panel>
        <Panel className="xl:col-span-3" title="Reservoir storage through the day">
          <StorageChart />
        </Panel>
      </div>
      <HamiltonFacts />
      {demo && <HamiltonDemo onClose={() => setDemo(false)} />}
    </div>
  );
}
