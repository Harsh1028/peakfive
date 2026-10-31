import { createFileRoute, Link } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/terms")({
  head: () =>
    seo(
      "Terms of Service · Draft",
      "Draft placeholder pending legal review; not finalized commercial terms.",
    ),
  component: Page,
});
function Page() {
  return (
    <div className="site-band">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs uppercase tracking-widest text-primary">PEAKFIVE</p>
        <h1 className="mt-4 text-4xl font-semibold">Terms of Service · Draft</h1>
        <p className="my-8 text-lg text-muted-foreground">
          Draft placeholder pending legal review; not finalized commercial terms.
        </p>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Draft — not legally reviewed</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Legal entity, jurisdiction, commercial conditions, support commitments, retention and
            liability terms remain unprovided. This placeholder is not production-approved legal
            advice.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Decision support only</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            The platform is a prototype for engineering analysis. Simulated results do not describe
            measured Hamilton operations or constitute a verified financial or carbon-savings
            guarantee.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Account creation</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Get Started Free means free account creation, not a promise of free commercial
            optimization service.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Engineering responsibility</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Any real deployment requires operator review, hydraulic validation, utility cooperation
            and verified input and tariff data. No actual equipment control is provided.
          </p>
        </section>
        <Link to="/demo" className="text-primary">
          Explore the live demonstration →
        </Link>
      </div>
    </div>
  );
}
