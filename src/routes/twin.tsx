import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { CAPACITY } from "@/lib/engine";
import { useSim } from "@/lib/sim-store";
import { StorageChart, WaterBalanceChart } from "@/components/pf/charts";
import { Playback } from "@/components/pf/panels";
import { PageHeader, Panel, Tag } from "@/components/pf/ui";
import { PumpStation, Tank } from "@/components/pf/visuals";

export const Route = createFileRoute("/twin")({
  head: () => seo("Water System Digital Twin", "Animated reservoir and pumping station driven by a 15-minute water-balance simulation."),
  component: Twin,
});

function Twin() {
  const { config, view, capacity, demand, pumps, mode, system } = useSim();
  return (
    <div className="space-y-5">
      <PageHeader title="Water System Digital Twin" sub="Storage(next) = Storage + Pumped − Consumption, every 15 minutes for 96 steps." right={<Tag tone="info">{mode === "backend" ? "Backend schedule" : `Demo ${view} schedule`}</Tag>} />
      <Playback />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Reservoir"><Tank /></Panel>
        <Panel title="High-lift pumping station" sub="Synthetic pump specifications"><PumpStation /></Panel>
      </div>
      <Panel title="Storage level" sub="Red dashed line = operating minimum + fire reserve (illustrative constraints)"><StorageChart height={260} /></Panel>
      <Panel title="Consumption vs production" sub="Synthetic municipal water demand, illustrative demonstration."><WaterBalanceChart height={240} /></Panel>
      <Panel title="Synthetic tank parameters">
        <div className="num grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          {[["Capacity", `${capacity} m³`], ["Initial", `${config.initial} m³`], ["Minimum reserve", `${config.minReserve} m³`], ["End-of-day target", `${config.finalTarget} m³`], ["Resolution", "15 min"], ["Steps", "96"], ["Daily demand", `${demand.reduce((a, b) => a + b, 0).toFixed(1)} m³`], ["Pumps", `${pumps.map((p) => p.flow).join(" + ")} m³/h`]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">{k}</div><div>{v}</div></div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Illustrative engineering parameters, not actual municipal operating data.</p>
      </Panel>
    </div>
  );
}
