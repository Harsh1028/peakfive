import { createFileRoute } from "@tanstack/react-router";
import { Leaf } from "lucide-react";
import { CarbonDashboard } from "@/components/pf/carbon";
import { PageHeader, Tag } from "@/components/pf/ui";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/carbon")({
  head: () =>
    seo(
      "Carbon Intelligence",
      "Verified Climatiq electricity emissions accounting for Ontario municipal pumping schedules, with transparent sources and methodology.",
    ),
  component: CarbonPage,
});
function CarbonPage() {
  return (
    <>
      <PageHeader
        title="Carbon Intelligence"
        sub="Estimated emissions for the Hamilton-inspired synthetic water system."
        right={
          <Tag tone="ok">
            <Leaf className="h-3 w-3" />
            Powered by Climatiq
          </Tag>
        }
      />
      <CarbonDashboard />
    </>
  );
}
