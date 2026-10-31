import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSim } from "@/lib/sim-store";
import { useCarbon } from "@/lib/carbon-store";
import { useAdvisor } from "@/lib/ai/advisor-store";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
export function EngineeringAdvisorContext() {
  const s = useSim(); const c = useCarbon(); const advisor = useAdvisor();
  const page = useRouterState({ select: state => state.location.pathname });
  useEffect(() => {
    advisor.context.current = {
      page, request: { date: s.date, system: s.system, events: s.events, peak_window: { start_slot: s.config.peakStart * 4, end_slot: s.config.peakEnd * 4 } },
      result: s.mode === "backend" ? s.backendResult : null,
      comparison: s.mode === "backend" ? s.comparison : null,
      grid: { ...s.dataset, loading: s.loading, error: s.dataError }, view: s.view,
      carbon: c.reply?.ok ? { co2e: c.reply.estimate.co2e, unit: c.reply.estimate.unit, kwh: c.reply.estimate.kwh, region: c.reply.estimate.region, method: c.reply.estimate.method, notices: c.reply.estimate.notices } : null,
    };
  }, [advisor.context, page, s.date, s.system, s.events, s.config.peakStart, s.config.peakEnd, s.mode, s.backendResult, s.comparison, s.dataset, s.loading, s.dataError, s.view, c.reply]);
  return null;
}
export function ExplainWithAi() {
  const s = useSim(); const advisor = useAdvisor();
  if (!s.backendResult) return null;
  return <Button variant="outline" size="sm" onClick={advisor.explain}><MessageCircle />Explain With PEAKFIVE AI</Button>;
}