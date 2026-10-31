import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { gridFactors } from "@/lib/engine";
import { useSim } from "@/lib/sim-store";
import { DemandChart } from "@/components/pf/charts";
import { DataControls, IciPanel, IllustrativeBanner, Playback, SourceBadge } from "@/components/pf/panels";
import { PageHeader, Panel } from "@/components/pf/ui";

export const Route = createFileRoute("/grid")({
  head: () => seo("Grid Intelligence", "Hourly Ontario electricity demand from IESO public reports, with upload validation and peak-window context."),
  component: Grid,
});

function Grid() {
  const { dataset } = useSim();
  const h = dataset.hourly;
  const max = Math.max(...h), min = Math.min(...h);
  const gf = gridFactors(h);
  return (
    <div className="space-y-5">
      <PageHeader title="Grid Intelligence" sub="Hourly Ontario Demand retrieved server-side from the IESO public archive, or from an uploaded official CSV." right={<SourceBadge />} />
      <IllustrativeBanner />
      <Panel title="Ontario Demand" sub={`${dataset.date} · 24 hourly readings`} right={<DataControls />}><DemandChart height={360} /></Panel>
      <Playback />
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Daily statistics">
          <dl className="num grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Peak</dt><dd className="text-lg">{max.toLocaleString()} MW</dd><dd className="text-xs text-muted-foreground">HE {h.indexOf(max) + 1}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Minimum</dt><dd className="text-lg">{min.toLocaleString()} MW</dd><dd className="text-xs text-muted-foreground">HE {h.indexOf(min) + 1}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Average</dt><dd className="text-lg">{Math.round(h.reduce((a, b) => a + b, 0) / 24).toLocaleString()} MW</dd></div>
            <div><dt className="text-xs text-muted-foreground">Swing</dt><dd className="text-lg">{(max - min).toLocaleString()} MW</dd></div>
          </dl>
        </Panel>
        <Panel title="Grid factor (optimizer input)" sub="Normalized daily demand, 0–1">
          <div className="flex h-28 items-end gap-0.5">
            {gf.map((v, i) => <div key={i} title={`HE${i + 1}: ${v.toFixed(2)}`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(4, v * 100)}%` }} />)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Cost weight = 1 + 0.35 × grid factor + 6.5 inside the risk window. Illustrative preferences, not tariffs.</p>
        </Panel>
        <IciPanel />
      </div>
      <Panel title="Hourly table">
        <div className="num grid grid-cols-4 gap-2 text-xs sm:grid-cols-6 lg:grid-cols-12">
          {h.map((v, i) => <div key={i} className="rounded border border-border p-2"><div className="text-muted-foreground">HE{i + 1}</div><div>{v.toLocaleString()}</div></div>)}
        </div>
      </Panel>
    </div>
  );
}
