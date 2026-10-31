// Parser/validator for IESO PUB_Demand_YYYY.csv files (shared by server fetch and upload).

export type DayResult = { ok: true; date: string; hourly: number[] } | { ok: false; error: string };

export function extractDay(text: string, date: string): DayResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex((l) => !l.startsWith("\\") && /date/i.test(l) && /ontario demand/i.test(l));
  if (headerIdx < 0) return { ok: false, error: "Missing header row with Date, Hour, Market Demand, Ontario Demand columns." };
  const cols = lines[headerIdx].split(",").map((c) => c.trim().toLowerCase());
  const di = cols.indexOf("date"), hi = cols.indexOf("hour"), oi = cols.indexOf("ontario demand");
  if (di < 0 || hi < 0 || oi < 0 || !cols.includes("market demand"))
    return { ok: false, error: "Unexpected columns. Expected Date, Hour, Market Demand, Ontario Demand." };
  const hours = new Map<number, number>();
  for (const l of lines.slice(headerIdx + 1)) {
    if (l.startsWith("\\")) continue;
    const p = l.split(",");
    if (p[di]?.trim() !== date) continue;
    const h = Number(p[hi]), v = Number(p[oi]);
    if (!Number.isInteger(h) || h < 1 || h > 24) return { ok: false, error: `Invalid hour value "${p[hi]}" for ${date}.` };
    if (!Number.isFinite(v) || v <= 0) return { ok: false, error: `Invalid Ontario Demand at hour ${h}.` };
    if (hours.has(h)) return { ok: false, error: `Duplicate hour ${h} for ${date}.` };
    hours.set(h, v);
  }
  if (hours.size === 0) return { ok: false, error: `No records found for ${date}.` };
  if (hours.size !== 24) return { ok: false, error: `Expected 24 hourly records for ${date}, found ${hours.size}.` };
  return { ok: true, date, hourly: Array.from({ length: 24 }, (_, i) => hours.get(i + 1)!) };
}
