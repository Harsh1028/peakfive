import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { useSim } from "@/lib/sim-store";
import { PageHeader, Panel, Tag } from "@/components/pf/ui";

export const Route = createFileRoute("/methodology")({
  head: () => seo("Data Sources & Methodology", "Transparent provenance for every PEAKFIVE dataset: verified IESO data, synthetic system parameters and hypothetical finances."),
  component: Methodology,
});

const LINKS = [
  "https://reports-public.ieso.ca/public/Demand/",
  "https://www.ieso.ca/en/power-data/data-directory",
  "https://www.ieso.ca/peaktracker/",
  "https://data.ontario.ca/dataset/energy-use-and-greenhouse-gas-emissions-for-the-broader-public-sector",
];

function Methodology() {
  const { dataset } = useSim();
  return (
    <div className="space-y-5">
      <PageHeader title="Data Sources & Methodology" sub="Every number in PEAKFIVE belongs to exactly one of three categories." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Verified public information" right={<Tag tone="ok">Verified</Tag>}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>IESO hourly Ontario Demand — currently {dataset.source === "ILLUSTRATIVE" ? <span className="text-warning">not loaded (illustrative profile in use)</span> : <span className="text-success">loaded for {dataset.date}</span>}</li>
            <li>IESO Peak Tracker ICI reading (25,646 MW, Jul 14 2026 HE17)</li>
            <li>Published ICI eligibility rules and methodology</li>
            <li>Ontario broader public-sector annual energy reporting, if imported</li>
          </ul>
        </Panel>
        <Panel title="Synthetic demonstration data" right={<Tag tone="warn">Synthetic</Tag>}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Tank capacity, initial storage, minimum reserve</li><li>Pump specifications</li><li>Community water demand (1,082 m³/day)</li>
            <li>Baseline pumping schedule</li><li>Optimization penalties and weights</li><li>24-hour illustrative grid profile</li>
          </ul>
        </Panel>
        <Panel title="Hypothetical financial assumptions" right={<Tag tone="bad">Hypothetical</Tag>}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Customer annual electricity expenditure</li><li>Annual bill-saving percentage</li><li>Proposed subscription price</li><li>Company revenue projections</li>
          </ul>
        </Panel>
      </div>
      <Panel title="Method">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>The yearly IESO CSV is fetched server-side, cached, and validated (columns, date, exactly 24 hourly records) before use. Uploaded files pass the same checks.</li>
          <li>Water balance runs every 15 minutes: Storage(next) = Storage + Pumped − Consumption.</li>
          <li>The baseline uses storage bands with pump hysteresis.</li>
          <li>The optimizer is exact dynamic programming over integer storage (0–420 m³) and previous pump state, evaluating all four pump combinations at each of 96 steps. Cost = kWh × (1 + 0.35 × grid factor + 6.5 in window) + 0.8 per pump start. These are illustrative weights, never dollars.</li>
          <li>The optimized plan must end with at least the baseline’s final storage when the baseline is feasible.</li>
          <li>A separate validator re-simulates the schedule and checks reserve, capacity, final target, pump availability and mass balance. Nothing is marked feasible unless it passes.</li>
        </ol>
        <p className="mt-4 text-sm text-warning">Annual public-sector energy reporting is not a source of hourly pump operations, storage levels or live municipal water demand. PEAKFIVE does not invent real municipal measurements.</p>
      </Panel>
      <Panel title="Sources">
        <ul className="space-y-1.5 text-sm">{LINKS.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer" className="break-all text-primary underline">{l}</a></li>)}</ul>
      </Panel>
    </div>
  );
}
