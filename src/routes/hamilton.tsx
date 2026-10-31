import { createFileRoute } from "@tanstack/react-router";
import { HamiltonViewModes, HamiltonWaterDashboard } from "@/components/pf/hamilton-water-data";
import { PageHeader } from "@/components/pf/ui";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/hamilton")({
  head: () =>
    seo(
      "Verified Hamilton Water Data",
      "Official Woodward 2025 monthly treated-water production, reported daily averages and maxima with City of Hamilton report provenance, separate from engineering simulation.",
    ),
  component: HamiltonDataPage,
});
function HamiltonDataPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Verified Hamilton Water Data"
        sub="Published municipal measurements, not simulated pump or reservoir telemetry."
        right={<HamiltonViewModes />}
      />
      <HamiltonWaterDashboard />
    </div>
  );
}
