import { createFileRoute } from "@tanstack/react-router";
import { Simulator } from "@/components/pf/simulator";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/simulator")({ head: () => seo("Operational Scenario Simulator", "Test simulated pump availability, storage constraints and demand against the live Python optimizer."), component: Simulator });