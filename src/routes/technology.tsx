import { createFileRoute, Link } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/technology")({
  head: () =>
    seo(
      "PEAKFIVE Technology",
      "Python optimization, source-labelled data and transparent engineering validation.",
    ),
  component: Page,
});
function Page() {
  return (
    <div className="site-band">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs uppercase tracking-widest text-primary">PEAKFIVE</p>
        <h1 className="mt-4 text-4xl font-semibold">PEAKFIVE Technology</h1>
        <p className="my-8 text-lg text-muted-foreground">
          Python optimization, source-labelled data and transparent engineering validation.
        </p>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Optimization engine</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            The deployed FastAPI service calculates 96 quarter-hour pumping intervals. No JavaScript
            simulation replaces remote results.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Digital twin and independent checks</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Calculated storage and power profiles are checked for water balance, reservoir limits,
            pump constraints and peak metrics.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Public data integration</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Official Hamilton annual-report values and IESO historical electricity information
            retain their own sources and units.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Environmental estimates</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Climatiq estimates Ontario electricity emissions from validated schedule-derived
            consumption. Annual-average estimates are not real-time carbon intensity.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Deployment boundary</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            PEAKFIVE is a decision-support prototype. It is not connected to SCADA, PLCs or actual
            pump hardware.
          </p>
        </section>
        <Link to="/demo" className="text-primary">
          Explore the live demonstration →
        </Link>
      </div>
    </div>
  );
}
