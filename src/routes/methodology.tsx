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
            <li>Tank capacity, initial storage, minimum reserve</li><li>Pump specifications</li><li>Community water demand (96 illustrative 15-minute values)</li>
            <li>Frontend-only demo baseline pumping schedule</li><li>Optimization penalties and weights</li><li>24-hour illustrative grid profile</li>
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
          <li>Actual schedules come from the Python FastAPI backend. IESO grid demand is shown separately and is not sent as municipal water demand.</li>
          <li>The backend weighs peak-window energy 10×, penalizes peak site demand and pump starts. These illustrative weights are not tariffs.</li>
          <li>Reservoir storage is reported at the start of each interval; the 24:00 boundary includes final inflow, demand and applicable fire events. The hard floor is operating minimum plus fire reserve, even during fires.</li>
          <li>Returned schedules are checked for water balance, capacity, storage floor, end-of-day replenishment and pump constraints. Feasible timeout results are not proven optimal.</li>
          <li>The guided frontend demo retains its separate local simulator. It is never used as a fallback when the backend fails. No backend savings are claimed: coincident_kw_before is null.</li>
        </ol>
        <p className="mt-4 text-sm text-warning">Annual public-sector energy reporting is not a source of hourly pump operations, storage levels or live municipal water demand. PEAKFIVE does not invent real municipal measurements.</p>
      </Panel>
      <Panel title="Sources">
        <ul className="space-y-1.5 text-sm">{LINKS.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer" className="break-all text-primary underline">{l}</a></li>)}</ul>
      </Panel>
    </div>
  );
}
