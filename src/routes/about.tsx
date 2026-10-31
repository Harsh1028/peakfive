import { TeamSection } from "@/components/site/team";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/about")({
  head: () =>
    seo(
      "About PEAKFIVE",
      "An engineering decision-support platform for exploring water and electricity trade-offs.",
    ),
  component: Page,
});
function Page() {
  return (
    <div className="site-band">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs uppercase tracking-widest text-primary">PEAKFIVE</p>
        <h1 className="mt-4 text-4xl font-semibold">About PEAKFIVE</h1>
        <p className="my-8 text-lg text-muted-foreground">
          An engineering decision-support platform for exploring water and electricity trade-offs.
        </p>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Our purpose</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Help engineers explore the relationship between reliable water service, pumping
            flexibility and electricity demand with transparent assumptions.
          </p>
        </section>
        <section className="border-t border-border py-8">
          <TeamSection />
        </section>
        <section className="border-t border-border py-8">
          <h2 className="text-xl font-semibold">Our approach</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Distinguish published measurements, simulated engineering inputs and actual calculated
            results. Hamilton is a prospective example, not an affiliated customer or partner.
          </p>
        </section>
        <Link to="/demo" className="text-primary">
          Explore the live demonstration →
        </Link>
      </div>
    </div>
  );
}
