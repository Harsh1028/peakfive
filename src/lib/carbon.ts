import { z } from "zod";
import {
  scheduleToPlan,
  validateRequest,
  type OptimizeRequest,
  type OptimizeResponse,
} from "./peakfive-api";

export const carbonOptionsSchema = z.object({
  year: z.number().int().min(1990).max(2100).nullable(),
  includeBase: z.boolean(),
  multiplier: z.number().finite().min(0.1).max(3),
});
export type CarbonOptions = z.infer<typeof carbonOptionsSchema>;
export const DEFAULT_CARBON_OPTIONS: CarbonOptions = {
  year: null,
  includeBase: false,
  multiplier: 1,
};
export function scheduleEnergy(
  result: OptimizeResponse,
  request: OptimizeRequest,
  options: CarbonOptions,
) {
  const checked = validateRequest(request);
  scheduleToPlan(result, checked);
  const intervals = result.schedule.map(
    (row) =>
      (row.kw - (options.includeBase ? 0 : checked.system.base_load_kw)) *
      0.25 *
      options.multiplier,
  );
  if (intervals.some((value) => value < 0 || !Number.isFinite(value)))
    throw new Error("Invalid schedule electricity consumption.");
  return { intervals, kwh: intervals.reduce((sum, value) => sum + value, 0) };
}
const sourceSchema = z.object({
  data_category: z.string().optional(),
  name: z.string().optional(),
  source: z.string().optional(),
  source_dataset: z.string().optional(),
  year: z.union([z.string(), z.number()]).nullable().optional(),
  region: z.string().optional(),
  region_name: z.string().optional(),
  id: z.string().optional(),
});
const providerSchema = z.object({
  location: z.object({
    consumption: z.object({
      co2e: z.number().finite().nonnegative(),
      co2e_unit: z.literal("kg"),
      co2e_calculation_method: z.string().min(1),
      source_trail: z.array(sourceSchema).min(1),
    }),
  }),
  notices: z
    .array(
      z.object({
        code: z.string().optional(),
        message: z.string().optional(),
        severity: z.string().optional(),
      }),
    )
    .optional(),
});
export function parseCarbonResponse(body: unknown, requestedYear: number | null) {
  const parsed = providerSchema.parse(body);
  const consumption = parsed.location.consumption;
  const factors = consumption.source_trail.filter((s) => s.data_category === "emission_factor");
  if (!factors.length || factors.some((s) => !s.region || s.year == null))
    throw new Error("Emissions factor metadata is incomplete.");
  const mismatch = factors.some(
    (s) => s.region !== "CA-ON" || (requestedYear !== null && Number(s.year) !== requestedYear),
  );
  return {
    co2e: consumption.co2e,
    unit: consumption.co2e_unit,
    method: consumption.co2e_calculation_method,
    sources: consumption.source_trail,
    notices: parsed.notices ?? [],
    mismatch,
    years: [...new Set(factors.map((s) => String(s.year)))],
    regions: [...new Set(factors.map((s) => s.region ?? "Unknown"))],
  };
}
export type CarbonEstimate = ReturnType<typeof parseCarbonResponse> & {
  kwh: number;
  region: "CA-ON";
  sourceSet: "core";
  requestedYear: number | null;
  calculatedAt: string;
  cached: boolean;
};
export type CarbonReply = { ok: true; estimate: CarbonEstimate } | { ok: false; error: string };
export function allocateCarbon(intervals: number[], dailyCo2e: number) {
  const total = intervals.reduce((a, b) => a + b, 0);
  return intervals.map((kwh) => (total === 0 ? 0 : (dailyCo2e * kwh) / total));
}
