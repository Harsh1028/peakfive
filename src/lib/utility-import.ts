import { z } from "zod";

const text = z.string().trim().min(1).max(500);
const measurementSchema = z.object({
  timestamp: text,
  assetId: text,
  metric: z.enum(["pump_power", "pump_flow", "reservoir_storage", "reservoir_level", "water_demand", "distribution_flow", "pump_state"]),
  unit: text,
  value: z.number().finite().nonnegative(),
}).strict();
const schema = z.object({
  provenance: z.object({ source: text, sourceReference: text, providedBy: text, systemName: text, systemId: text, timezone: text }).strict(),
  intervalMinutes: z.number().int().min(1).max(1440),
  startTimestamp: text,
  endTimestamp: text,
  records: z.array(measurementSchema).min(1).max(100000),
}).strict();
export type UtilityImport = z.infer<typeof schema>;
export type UtilityRecord = UtilityImport["records"][number];
export const METRIC_UNITS = {
  pump_power: ["kW"], pump_flow: ["m³/h", "L/s"], reservoir_storage: ["m³"], reservoir_level: ["m"],
  water_demand: ["m³/interval", "m³/h", "L/s"], distribution_flow: ["m³/h", "L/s"], pump_state: ["boolean"],
} as const;

function timestampMs(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error("Every timestamp must include seconds and an explicit UTC offset or Z.");
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error("Invalid timestamp.");
  const local = value.slice(0, 19);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const part = (name: string) => parts.find(p => p.type === name)?.value ?? "";
  if (`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}` !== local)
    throw new Error("Timestamp offsets or calendar values do not match the documented time zone.");
  return ms;
}

export function validateUtilityImport(input: unknown): UtilityImport {
  const data = schema.parse(input);
  try { new Intl.DateTimeFormat("en", { timeZone: data.provenance.timezone }); }
  catch { throw new Error("Document a valid IANA time zone, such as America/Toronto."); }
  const start = timestampMs(data.startTimestamp, data.provenance.timezone);
  const end = timestampMs(data.endTimestamp, data.provenance.timezone);
  const step = data.intervalMinutes * 60000;
  if (end < start || (end - start) % step !== 0) throw new Error("Declared time range must align to the stated interval.");
  const expectedCount = (end - start) / step + 1;
  if (expectedCount > 100000) throw new Error("Declared range exceeds 100,000 intervals.");
  const series = new Map<string, { unit: string; timestamps: Set<number> }>();
  for (const row of data.records) {
    if (!(METRIC_UNITS[row.metric] as readonly string[]).includes(row.unit)) throw new Error(`Unsupported unit for ${row.metric}: ${row.unit}.`);
    if (row.metric === "pump_state" && row.value !== 0 && row.value !== 1) throw new Error("Pump state must be 0 or 1 with unit boolean.");
    const ms = timestampMs(row.timestamp, data.provenance.timezone);
    if (ms < start || ms > end || (ms - start) % step !== 0) throw new Error("Record timestamp is outside the declared range or off interval.");
    const key = JSON.stringify([row.assetId, row.metric]);
    const group = series.get(key) ?? { unit: row.unit, timestamps: new Set<number>() };
    if (group.unit !== row.unit) throw new Error("Units must be consistent within each asset/measurement series.");
    if (group.timestamps.has(ms)) throw new Error("Duplicate timestamp within an asset/measurement series.");
    group.timestamps.add(ms); series.set(key, group);
  }
  for (const group of series.values()) if (group.timestamps.size !== expectedCount) throw new Error("Missing intervals in an asset/measurement series; no values were filled or estimated.");
  return { ...data, records: [...data.records].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)) };
}