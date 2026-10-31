import { z } from "zod";
import defaults from "./backend-defaults.json";
import type { Evaluation, Validation, Combo } from "./engine";

const finite = z.number().finite().nonnegative();
const pumpSchema = z.object({ id: z.string().min(1), kw: finite, flow_m3h: finite, min_run_slots: z.number().int().min(1), min_off_slots: z.number().int().min(1), max_starts_per_day: z.number().int().nonnegative(), available: z.boolean() });
export const systemSchema = z.object({ slot_minutes: z.literal(15), pumps: z.array(pumpSchema).max(20), tank: z.object({ capacity_m3: finite, initial_m3: finite, min_operating_m3: finite, fire_reserve_m3: finite }), base_load_kw: finite, demand_m3_per_slot: z.array(finite).length(96) });
export type System = z.infer<typeof systemSchema>;
export const DEFAULT_SYSTEM: System = systemSchema.parse(defaults);
export type PeakfiveEvent = { type: "fire"; start_slot: number; end_slot: number; extra_m3_per_slot: number } | { type: "pump_outage"; start_slot: number; end_slot: number; pump_id: string };
export interface OptimizeRequest { date: string; peak_window: { start_slot: number; end_slot: number }; system: System; events: PeakfiveEvent[] }
const eventSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("fire"), start_slot: z.number().int().min(0).max(95), end_slot: z.number().int().min(1), extra_m3_per_slot: finite }), z.object({ type: z.literal("pump_outage"), start_slot: z.number().int().min(0).max(95), end_slot: z.number().int().min(1), pump_id: z.string().min(1) })]);
const requestSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Invalid calendar date"), peak_window: z.object({ start_slot: z.number().int().min(0).max(95), end_slot: z.number().int().min(0).max(96) }), system: systemSchema, events: z.array(eventSchema).max(500) }).superRefine((r, ctx) => {
  const ids = r.system.pumps.map((p) => p.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["system", "pumps"], message: "Pump IDs must be unique" });
  r.events.forEach((e, i) => { if (e.end_slot <= e.start_slot) ctx.addIssue({ code: "custom", path: ["events", i], message: "Event end must follow start" }); if (e.type === "pump_outage" && !ids.includes(e.pump_id)) ctx.addIssue({ code: "custom", path: ["events", i], message: "Unknown outage pump" }); });
});
const responseSchema = z.object({ status: z.enum(["optimal", "feasible_timeout", "infeasible", "timeout_no_solution", "invalid_input", "error"]), schedule: z.array(z.object({ slot: z.number().int().min(0).max(95), pumps_on: z.array(z.string()), kw: finite, tank_m3: finite })), coincident_kw_before: z.null(), coincident_kw_after: finite.nullable(), explanation: z.string() });
export type OptimizeResponse = z.infer<typeof responseSchema>;
export const REQUEST_TIMEOUT_MS = 45_000;
export const configuredApiUrl = () => (import.meta.env.VITE_PEAKFIVE_API as string | undefined)?.trim() ?? "";
export function normalizeApiUrl(value: string) {
  if (!value.trim()) throw new Error("Backend address is not configured. Enter your teammate’s HTTPS API address.");
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Enter a valid HTTP or HTTPS backend address without credentials or query parameters.");
  if (typeof window !== "undefined" && window.location.protocol === "https:" && url.protocol !== "https:") throw new Error("This HTTPS dashboard requires an HTTPS backend.");
  return url.toString().replace(/\/$/, "");
}
async function callApi(base: string, path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${normalizeApiUrl(base)}${path}`, { ...init, signal: controller.signal, credentials: "omit" });
    const body: unknown = await response.json();
    return { response, body };
  } catch (e) {
    if (controller.signal.aborted) throw new Error("Backend request timed out after 45 seconds. Feasibility remains unknown; retry the scenario.");
    if (e instanceof TypeError) throw new Error("Cannot reach the backend. Check its address, availability and allowed dashboard origins.");
    throw e;
  } finally { clearTimeout(timer); }
}
export async function checkHealth(base: string) {
  const { response, body } = await callApi(base, "/health");
  if (!response.ok || !z.object({ status: z.literal("ok") }).safeParse(body).success) throw new Error("Backend health check failed.");
}
export function validateRequest(input: OptimizeRequest) { return requestSchema.parse(input); }
export async function optimizeRemote(base: string, input: OptimizeRequest) {
  const { response, body } = await callApi(base, "/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validateRequest(input)) });
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    if (response.status === 422) throw new Error("Backend rejected the request body. Check the scenario inputs.");
    throw new Error("Backend returned an invalid response; no schedule has been substituted.");
  }
  if (!response.ok && ["optimal", "feasible_timeout"].includes(parsed.data.status)) throw new Error("Backend returned an inconsistent HTTP status.");
  if (response.status === 503) parsed.data.explanation = `${parsed.data.explanation} Retry after ${response.headers.get("Retry-After") ?? "5"} seconds.`;
  return parsed.data;
}
export const peakContains = (t: number, start: number, end: number) => start === end ? false : start < end ? t >= start && t < end : t >= start || t < end;
export function demandWithEvents(request: OptimizeRequest) {
  return request.system.demand_m3_per_slot.map((d, t) => d + request.events.reduce((sum, e) => sum + (e.type === "fire" && t >= e.start_slot && t < Math.min(96, e.end_slot) ? e.extra_m3_per_slot : 0), 0));
}
export function scheduleToPlan(result: OptimizeResponse, request: OptimizeRequest): { combos: Combo[]; eval: Evaluation; validation: Validation } {
  if (!["optimal", "feasible_timeout"].includes(result.status) || result.schedule.length !== 96 || result.schedule.some((r, i) => r.slot !== i)) throw new Error("Backend did not return an ordered, complete 96-slot schedule.");
  const { pumps, tank, base_load_kw } = request.system;
  const demand = demandWithEvents(request);
  const rows = result.schedule;
  const pumped = rows.map((r) => r.pumps_on.reduce((sum, id) => { const p = pumps.find((p) => p.id === id); if (!p) throw new Error("Backend schedule references an unknown pump."); return sum + p.flow_m3h * 0.25; }, 0));
  const last = rows[95];
  if (!last) throw new Error("Missing final interval.");
  const finalLevel = last.tank_m3 + pumped[95] - demand[95];
  const levels = [...rows.map((r) => r.tank_m3), finalLevel];
  const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const floor = tank.min_operating_m3 + tank.fire_reserve_m3;
  const checks = [
    { name: "Start storage", pass: close(levels[0], tank.initial_m3), detail: `${levels[0].toFixed(1)} m³ at 00:00` },
    { name: "Water balance", pass: rows.every((r, t) => close(levels[t + 1], r.tank_m3 + pumped[t] - demand[t])), detail: "96 intervals, including fire demand and calculated 24:00 storage" },
    { name: "Reservoir limits", pass: levels.every((v) => v >= floor - 0.01 && v <= tank.capacity_m3 + 0.01), detail: `${floor}–${tank.capacity_m3} m³ at all 97 boundaries` },
    { name: "End-of-day storage", pass: finalLevel >= tank.initial_m3 - 0.01, detail: `${finalLevel.toFixed(1)} m³; required ≥ ${tank.initial_m3} m³` },
    { name: "Facility power", pass: rows.every((r) => close(r.kw, base_load_kw + pumps.filter((p) => r.pumps_on.includes(p.id)).reduce((s, p) => s + p.kw, 0))), detail: "Reported kW includes essential site load" },
    { name: "Pump constraints", pass: pumps.every((p) => {
      let starts = 0, run = 0, off = p.min_off_slots;
      for (const r of rows) { const on = r.pumps_on.includes(p.id); if (on) { if (!p.available || request.events.some((e) => e.type === "pump_outage" && e.pump_id === p.id && r.slot >= e.start_slot && r.slot < Math.min(96, e.end_slot))) return false; if (run === 0) { starts++; if (off < p.min_off_slots) return false; } run++; off = 0; } else { if (run > 0 && run < p.min_run_slots) return false; run = 0; off++; } } return starts <= p.max_starts_per_day && (run === 0 || run >= p.min_run_slots);
    }), detail: "Availability, outages, minimum ON/OFF durations and daily starts" },
  ];
  if (!checks.every((c) => c.pass)) throw new Error(`Returned schedule failed frontend checks: ${checks.filter((c) => !c.pass).map((c) => c.name).join(", ")}. No schedule displayed.`);
  const kw = rows.map((r) => r.kw);
  const peakKw = kw.filter((_, t) => peakContains(t, request.peak_window.start_slot, request.peak_window.end_slot));
  if ((peakKw.length === 0 && result.coincident_kw_after !== null) || (peakKw.length > 0 && (result.coincident_kw_after === null || !close(Math.max(...peakKw), result.coincident_kw_after)))) throw new Error("Backend peak metric does not match its schedule.");
  const combos = rows.map((r) => ((r.pumps_on.includes(pumps[0]?.id) ? 1 : 0) | (r.pumps_on.includes(pumps[1]?.id) ? 2 : 0)) as Combo);
  const startups = pumps.reduce((sum, p) => sum + rows.filter((r, t) => r.pumps_on.includes(p.id) && (t === 0 || !rows[t - 1].pumps_on.includes(p.id))).length, 0);
  return { combos, eval: { levels, kw, pumped, dailyKwh: kw.reduce((s, k) => s + k * 0.25, 0), peakKwh: peakKw.reduce((s, k) => s + k * 0.25, 0), startups, finalLevel, objective: 0 }, validation: { pass: true, checks } };
}