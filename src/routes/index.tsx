import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Waves,
  Cpu,
  Radio,
  Leaf,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Btn, Tag } from "@/components/pf/ui";
import { seo } from "@/lib/seo";
import infrastructure from "@/assets/water-infrastructure.jpg";
import { HamiltonFacts } from "@/components/pf/hamilton";
export const Route = createFileRoute("/")({
  head: () =>
    seo(
      "Smarter Water. Smarter Energy.",
      "PEAKFIVE intelligent municipal pump scheduling, live engineering demonstrations, and source-labelled water and energy analysis.",
    ),
  component: Home,
});
const technologies = [
  [
    Cpu,
    "Python optimization engine",
    "Calculate pumping schedules under the submitted engineering constraints.",
  ],
  [
    Waves,
    "Municipal water digital twin",
    "Review calculated reservoir trajectories and pump states.",
  ],
  [
    Radio,
    "IESO historical data",
    "Explore separately sourced Ontario electricity-demand measurements.",
  ],
  [
    SlidersHorizontal,
    "Operational scenarios",
    "Test availability, fire demand and changing peak windows.",
  ],
  [
    Leaf,
    "Climatiq emissions estimates",
    "Review Ontario electricity estimates from validated schedules.",
  ],
  [
    ShieldCheck,
    "Engineering constraint checks",
    "Inspect independent checks before interpreting a returned schedule.",
  ],
] as const;
function Home() {
  const navigate = useNavigate();
  return (
    <>
      <section className="site-hero">
        <img
          src={infrastructure}
          alt="Illustrative modern water infrastructure, not a Hamilton facility"
          width={1920}
          height={1024}
        />
        <div className="site-inner relative z-10 w-full px-6">
          <Tag tone="ok">Intelligent infrastructure optimization</Tag>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl md:text-7xl">
            Smarter Water.
            <br />
            <span className="text-primary">Smarter Energy.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-foreground/85">
            Intelligent pump scheduling that helps municipal water utilities explore opportunities
            to reduce peak electricity demand while maintaining essential water-service
            requirements.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Btn size="lg" variant="primary" onClick={() => navigate({ to: "/signup" })}>
              Get Started Free <ArrowUpRight className="h-5 w-5" />
            </Btn>
            <Btn size="lg" onClick={() => navigate({ to: "/demo" })}>
              Try Live Demo
            </Btn>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Free account creation · no commercial service commitment
          </p>
        </div>
        <p className="absolute bottom-5 right-5 z-10 text-[10px] text-foreground/70">
          Illustrative infrastructure image · not Hamilton telemetry
        </p>
      </section>
      <section className="site-band border-b border-border">
        <div className="site-inner grid gap-8 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">The challenge</p>
            <h2 className="mt-3 text-3xl font-semibold">
              Reliable water service.
              <br />A changing energy landscape.
            </h2>
          </div>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Water utilities must meet demand and maintain operating and fire reserves while managing
            electricity costs. PEAKFIVE explores how pumping flexibility and available storage could
            change peak-window demand—without presenting a simulation as measured utility savings.
          </p>
        </div>
      </section>
      <section className="site-band">
        <div className="site-inner">
          <p className="text-xs uppercase tracking-widest text-primary">How PEAKFIVE works</p>
          <h2 className="mt-3 text-3xl font-semibold">From constraints to calculated decisions.</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-4">
            {[
              "Understand electricity-demand patterns.",
              "Configure pumping and storage constraints.",
              "Calculate optimized pumping schedules.",
              "Review operating results and environmental estimates.",
            ].map((v, i) => (
              <div key={v} className="border-t border-primary/40 pt-5">
                <span className="num text-sm text-primary">0{i + 1}</span>
                <h3 className="mt-4 text-lg">{v}</h3>
              </div>
            ))}
          </div>
          <Link to="/how-it-works" className="mt-8 inline-flex items-center gap-2 text-primary">
            Explore the workflow <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <section className="site-band border-y border-border bg-card/40">
        <div className="site-inner">
          <p className="text-xs uppercase tracking-widest text-success">Explore our technology</p>
          <h2 className="mt-3 text-3xl font-semibold">Engineering depth, in one workspace.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {technologies.map(([Icon, title, copy]) => (
              <article key={title} className="rounded-lg border border-border bg-background/60 p-6">
                <Icon className="h-7 w-7 text-primary" />
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="site-band">
        <div className="site-inner">
          <p className="text-xs uppercase tracking-widest text-primary">
            Hamilton municipal case study
          </p>
          <h2 className="mt-3 text-3xl font-semibold">Public evidence. Transparent simulation.</h2>
          <p className="my-6 max-w-3xl text-muted-foreground">
            Explore sourced Woodward water-system information and 2025 production measurements.
            Hamilton is a prospective example municipality, not a customer or partner. Simulated
            pumps, reservoirs and water-demand profiles remain separate from published measurements.
          </p>
          <HamiltonFacts />
          <Link to="/hamilton" className="mt-6 inline-flex items-center gap-2 text-primary">
            View the sourced case study <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <section className="site-band border-y border-border">
        <div className="site-inner flex flex-wrap items-center justify-between gap-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold">Built for engineering decisions.</h2>
            <p className="mt-4 text-muted-foreground">
              Operator review, scenario evaluation and transparent analysis—not autonomous equipment
              control. Real deployment requires utility cooperation, hydraulic validation and
              verified operating data.
            </p>
          </div>
          <Btn size="lg" variant="primary" onClick={() => navigate({ to: "/demo" })}>
            Try Live Demo <ArrowUpRight className="h-5 w-5" />
          </Btn>
        </div>
      </section>
      <section className="site-band">
        <div className="site-inner">
          <h2 className="text-3xl font-semibold">About the team</h2>
          <p className="mt-3 text-muted-foreground">
            Team details will be published when supplied.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <article key={i} className="rounded-lg border border-border p-6">
                <span className="num text-primary">0{i}</span>
                <h3 className="mt-4 text-lg">Team member {i}</h3>
                <p className="mt-2 text-sm text-muted-foreground">Name and biography pending.</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
