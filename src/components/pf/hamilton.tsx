import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Droplets,
  Gauge,
  Info,
  MapPin,
  Waves,
  Zap,
} from "lucide-react";
import { useSim } from "@/lib/sim-store";
import { Btn, Tag } from "./ui";
import { OptimizeButton } from "./panels";
import { HAMILTON_REPORT } from "@/lib/hamilton-data";

const BUDGET_URL =
  "https://www.hamilton.ca/city-council/city-administration/city-budget/2024-tax-rate-budget/2024-rate-budget";
const WATER_URL =
  "https://www.hamilton.ca/home-neighbourhood/water-wastewater-stormwater/water-treatment-distribution/drinking-water-system";

export function HamiltonFacts() {
  return (
    <section className="space-y-4 border-y border-border py-5" aria-labelledby="hamilton-facts">
      <div>
        <h2 id="hamilton-facts" className="text-lg font-semibold">
          Hamilton's Water Infrastructure
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Woodward distribution-system context · 2025 annual report, section 2.2.1, printed page 8.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            icon: Gauge,
            value: "22",
            label: "Water Pumping Stations",
            period: "Woodward distribution system · reported 2025",
          },
          {
            icon: Waves,
            value: "10",
            label: "Reservoirs",
            period: "Woodward distribution system · reported 2025",
          },
          {
            icon: Droplets,
            value: "4 + 1",
            label: "Elevated Storage Tanks + Standpipe",
            period: "Woodward distribution system · reported 2025",
          },
          {
            icon: Zap,
            value: "≈2,130",
            label: "km of Water Mains",
            period: "Approximate published network length · 2025",
          },
        ].map(({ icon: Icon, value, label, period }) => (
          <article key={label} className="rounded-lg border border-border bg-card p-4">
            <Icon className="mb-3 h-4 w-4 text-primary" />
            <div className="num text-xl font-semibold text-primary">{value}</div>
            <h3 className="mt-1 text-sm font-medium">{label}</h3>
            <p className="mt-2 text-[11px] text-muted-foreground">{period}</p>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <a href={`${HAMILTON_REPORT.url}#page=8`} target="_blank" rel="noreferrer" className="text-primary underline">
          City of Hamilton · 2025 annual report · printed page 8 ↗
        </a>
        <a href={WATER_URL} target="_blank" rel="noreferrer" className="text-primary underline">
          City of Hamilton · Drinking-water system ↗
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        These confirmed Woodward subsystem figures replace unconfirmed city-wide 2024 counts; reporting scopes are not interchangeable. No City equipment is connected.
      </p>
    </section>
  );
}

export function HamiltonOverview() {
  const navigate = useNavigate();
  return (
    <section className="space-y-4 border-l-2 border-primary bg-primary/5 px-5 py-5">
      <Tag tone="info">
        <MapPin className="h-3 w-3" />
        Hamilton, Ontario | Illustrative Pilot Scenario
      </Tag>
      <h2 className="text-xl font-semibold">Hamilton Municipal Water Case Study</h2>
      <p className="text-sm text-foreground">
        Exploring how intelligent pump scheduling could support municipal water infrastructure in
        Hamilton, Ontario.
      </p>
      <p className="max-w-4xl text-sm text-muted-foreground">
        Hamilton operates an extensive drinking-water infrastructure network. PEAKFIVE demonstrates
        how a hypothetical pumping subsystem could use reservoir storage to shift flexible
        electricity demand away from selected peak-risk periods.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Btn size="sm" onClick={() => navigate({ to: "/twin" })}>
          Explore Hamilton Scenario
          <ArrowRight className="h-4 w-4" />
        </Btn>
        <p className="text-xs text-muted-foreground">
          Prospective example municipality — no partnership, confirmed pilot or access to City
          infrastructure.
        </p>
      </div>
    </section>
  );
}

export function HamiltonTransparency() {
  return (
    <section className="space-y-4 border-y border-border py-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Info className="h-4 w-4 text-primary" />
        About This Demonstration
      </h2>
      <p className="text-sm text-muted-foreground">
        Real-world context comes from published City of Hamilton infrastructure information and
        Ontario electricity data where verified. Pump specifications, reservoir capacity and water
        requirements are simulated. Pumping schedules are calculated by the PEAKFIVE optimization
        engine.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Database,
            title: "Verified Public Data",
            text: "Confirmed City infrastructure information and IESO measurements. Pending budget figures and illustrative grid profiles are not verified data.",
          },
          {
            icon: Droplets,
            title: "Simulated Water System",
            text: "Pump specifications, reservoir storage and community water-demand profile — not Hamilton equipment.",
          },
          {
            icon: CheckCircle2,
            title: "Calculated Results",
            text: "Pump schedules, electrical consumption and reservoir levels generated by the Python optimization engine.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              {title}
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HamiltonSystem({ actions = true }: { actions?: boolean }) {
  const s = useSim();
  return (
    <section className="space-y-4">
      <div>
        <Tag tone="warn">Synthetic engineering parameters</Tag>
        <h2 className="mt-2 text-xl font-semibold">Hamilton-Inspired Pumping Subsystem</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          An illustrative two-pump system representing the type of pumping and storage flexibility
          that may exist within municipal water networks.
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        {s.pumps.map((p) => (
          <div key={p.id}>
            <dt className="text-xs text-muted-foreground">Simulated pump {p.id}</dt>
            <dd className="num mt-1">
              {p.kw} kW · {p.flow} m³/hour
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-muted-foreground">Simulated reservoir</dt>
          <dd className="num mt-1">
            {s.capacity.toLocaleString()} m³ capacity · {s.config.initial.toLocaleString()} m³
            initial
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Daily simulated water requirements</dt>
          <dd className="num mt-1">
            {s.demand
              .reduce((a, b) => a + b, 0)
              .toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
            m³ · 24 hours
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Operating minimum {s.system.tank.min_operating_m3} m³ + additional modelled emergency
        reserve {s.system.tank.fire_reserve_m3} m³ = {s.config.minReserve} m³ storage floor. 96
        intervals × 15 minutes. Current configuration; scenario edits remain in effect.
      </p>
      {actions && (
        <div className="flex flex-wrap items-center gap-4">
          <OptimizeButton size="md" label="Optimize Hamilton Scenario" />
          <Link to="/optimizer" className="text-sm text-primary underline">
            View Schedule Optimizer →
          </Link>
        </div>
      )}
    </section>
  );
}

export function HamiltonStrategy() {
  const { hasSchedule } = useSim();
  return (
    <section className="space-y-4 border-y border-border py-5">
      <h2 className="text-lg font-semibold">How PEAKFIVE Changes Pumping Decisions</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Conventional operation</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pumping is often determined by operational requirements, storage levels and established
            control rules.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-success">PEAKFIVE operation</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The system searches for an alternative schedule that moves flexible pumping away from a
            selected high-demand window while respecting modelled operating constraints.
          </p>
        </div>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          "Pump water earlier",
          "Store water",
          "Reduce pumping during the selected peak window",
          "Continue serving water demand",
        ].map((text, i) => (
          <li key={text} className="flex items-start gap-2 border-t border-primary/30 pt-3 text-sm">
            <span className="num text-primary">0{i + 1}</span>
            <span>{text}</span>
            {i < 3 && <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-primary" />}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Intended operating strategy, not a measured before/after comparison.{" "}
        {hasSchedule
          ? "Optimized schedule available. A validated conventional baseline is required to quantify savings."
          : "Run optimization to calculate a schedule. A validated conventional baseline is required to quantify savings."}
      </p>
    </section>
  );
}

export function MunicipalPilot() {
  return (
    <section className="space-y-4 border-y border-border py-5">
      <h2 className="text-lg font-semibold">From Prototype to Municipal Pilot</h2>
      <p className="text-sm text-muted-foreground">
        Hamilton is a prospective example municipality, not an existing customer or confirmed pilot
        partner. A real deployment would require:
      </p>
      <ol className="grid list-decimal gap-x-8 gap-y-2 pl-5 text-sm text-muted-foreground md:grid-cols-2">
        {[
          "Permission and cooperation from the utility.",
          "Actual pump performance and electricity consumption data.",
          "Real reservoir levels and demand profiles.",
          "Verified electricity tariffs and meter-level eligibility.",
          "Hydraulic network validation.",
          "Engineering review and operator approval.",
          "An initial read-only trial before any operational implementation.",
        ].map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        No assumption is made about Hamilton's electricity tariff or Industrial Conservation
        Initiative eligibility.
      </p>
    </section>
  );
}
