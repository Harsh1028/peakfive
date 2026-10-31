import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { seo } from "@/lib/seo";
import { PageHeader, Panel, Tag } from "@/components/pf/ui";
import { MunicipalPilot } from "@/components/pf/hamilton";

export const Route = createFileRoute("/business")({
  head: () =>
    seo(
      "Business Model",
      "PEAKFIVE's subscription model, target Ontario utilities and an illustrative five-year revenue scenario.",
    ),
  component: Business,
});

const REV = [
  { y: "Year 1", c: 5, arr: 75000 },
  { y: "Year 2", c: 20, arr: 300000 },
  { y: "Year 3", c: 50, arr: 750000 },
  { y: "Year 4", c: 100, arr: 1500000 },
  { y: "Year 5", c: 200, arr: 3000000 },
];

function Business() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Business Model"
        sub="Explainable, operator-approved pumping recommendations for Ontario municipal water utilities."
      />
      <MunicipalPilot />
      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Problem">
          <p className="text-sm text-muted-foreground">
            Municipal water infrastructure needs reliable pumping, but electricity operating costs
            can be substantial — especially during high-demand grid hours.
          </p>
        </Panel>
        <Panel title="Solution">
          <p className="text-sm text-muted-foreground">
            PEAKFIVE recommends pumping schedules that operators review and approve. Every plan is
            independently checked against storage, demand and equipment constraints.
          </p>
        </Panel>
        <Panel title="Target customers">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Significant pumping electricity consumption</li>
            <li>Adequate operational water storage</li>
            <li>Flexible pump scheduling opportunities</li>
            <li>Suitable electricity tariff incentives</li>
          </ul>
        </Panel>
        <Panel title="Pricing (annual subscription)" right={<Tag tone="warn">Hypothetical</Tag>}>
          <div className="num grid grid-cols-3 gap-3 text-sm">
            {[
              ["Small", "$5,000"],
              ["Medium", "$15,000"],
              ["Large", "$40,000+"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{k} utility</div>
                <div className="text-lg">{v}</div>
                <div className="text-[10px] text-muted-foreground">CAD / year</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Proposed prices, not validated market rates.
          </p>
        </Panel>
      </div>
      <Panel
        title="Five-year illustrative revenue scenario"
        right={<Tag tone="warn">Illustrative business scenario, not a market forecast.</Tag>}
      >
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={REV}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="y" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis
              yAxisId="a"
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickFormatter={(v) => `$${v / 1e6}M`}
            />
            <YAxis yAxisId="c" orientation="right" stroke="var(--muted-foreground)" fontSize={11} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }}
              formatter={(v: number, n) =>
                n === "arr" ? [`$${v.toLocaleString()}`, "ARR"] : [v, "Customers"]
              }
            />
            <Bar yAxisId="a" dataKey="arr" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            <Line yAxisId="c" dataKey="c" stroke="var(--success)" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title="Competitive positioning">
        <p className="text-sm text-muted-foreground">
          Established companies already offer water-pumping optimization products. PEAKFIVE focuses
          on Ontario-specific electricity economics, plain-language explainability of every schedule
          change, and a lightweight software deployment that smaller utilities can adopt.
        </p>
      </Panel>
    </div>
  );
}
