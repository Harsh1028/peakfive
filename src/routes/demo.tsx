import { createFileRoute } from "@tanstack/react-router";
import { Overview } from "@/components/pf/overview";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/demo")({ head: () => seo("Interactive Demonstration", "Public live-calculated PEAKFIVE pumping demonstration with simulated constraints and sourced Hamilton and IESO information."), component: Demo });
function Demo() { return <><div className="mb-6 border-b border-border pb-5"><h1 className="text-2xl font-semibold">PEAKFIVE Interactive Demonstration</h1><p className="mt-2 text-sm text-warning">Simulated municipal water system. Live-calculated optimization. Public electricity and water information labelled by source.</p></div><Overview /></>; }