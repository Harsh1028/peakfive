import { createServerFn } from "@tanstack/react-start";
import { extractDay, type DayResult } from "./ieso";

const cache = new Map<string, { text: string; at: number }>();
const TTL = 6 * 60 * 60 * 1000;

export const fetchIesoDay = createServerFn({ method: "GET" })
  .inputValidator((d: { date: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.date ?? "")) throw new Error("Invalid date");
    return d;
  })
  .handler(async ({ data }): Promise<DayResult> => {
    const year = data.date.slice(0, 4);
    try {
      let entry = cache.get(year);
      if (!entry || Date.now() - entry.at > TTL) {
        const res = await fetch(`https://reports-public.ieso.ca/public/Demand/PUB_Demand_${year}.csv`, {
          headers: { "user-agent": "PEAKFIVE/1.0 (municipal water dashboard)" },
        });
        if (!res.ok) return { ok: false, error: `IESO server returned ${res.status} for ${year}.` };
        entry = { text: await res.text(), at: Date.now() };
        cache.set(year, entry);
      }
      return extractDay(entry.text, data.date);
    } catch (e) {
      return { ok: false, error: `Could not reach IESO: ${e instanceof Error ? e.message : "network error"}` };
    }
  });
