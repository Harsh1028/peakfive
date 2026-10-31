import { createFileRoute, Link } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/how-it-works")({
  head: () =>
    seo(
      "How PEAKFIVE Works",
      "An engineering workflow from electricity patterns to independently checked schedules.",
    ),
  component: Page,
});
function Page() {
  return (
    <div className="site-band">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs uppercase tracking-widest text-primary">PEAKFIVE</p>
        <h1 className="mt-4 text-4xl font-semibold">How PEAKFIVE Works</h1>
        <p className="my-8 text-lg text-muted-foreground">
          An engineering workflow from electricity patterns to independently checked schedules.
        </p>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">01 · Understand the context</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Review source-labelled Ontario electricity-demand patterns. Grid demand is displayed
            separately and is not a tariff.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">02 · Configure the system</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Set illustrative pump availability, storage limits, water demand, reserves and emergency
            events.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">03 · Calculate schedules</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Send the submitted configuration to the deployed Python optimizer. Complete schedules
            are checked before display.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">04 · Review the results</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Explore pump states, reservoir trajectories, simulated comparison metrics and Climatiq
            estimates. Real deployment requires engineering review.
          </p>
        </section>
        <Link to="/demo" className="text-primary">
          Explore the live demonstration →
        </Link>
      </div>
    </div>
  );
}
