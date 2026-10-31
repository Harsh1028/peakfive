import { parseCarbonResponse, type CarbonEstimate, type CarbonReply } from "./carbon";

// Bounded, ephemeral per-worker cache and budget; no credentials or private data stored.
const cache = new Map<string, { at: number; estimate: CarbonEstimate }>();
const pending = new Map<string, Promise<CarbonReply>>();
let windowStart = 0;
let calls = 0;
export async function requestCarbon(
  kwh: number,
  year: number | null,
  apiKey: string,
): Promise<CarbonReply> {
  const key = JSON.stringify(["CA-ON", year, "core", "location.consumption", kwh]);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < 3600000)
    return { ok: true, estimate: { ...hit.estimate, cached: true } };
  const existing = pending.get(key);
  if (existing) return existing;
  if (now - windowStart >= 60000) {
    windowStart = now;
    calls = 0;
  }
  if (calls >= 20 || pending.size >= 4)
    return {
      ok: false,
      error:
        "Carbon request limit reached. Try again in a minute; pump scheduling remains available.",
    };
  calls++;
  const task = (async (): Promise<CarbonReply> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("https://api.climatiq.io/energy/v1.4/electricity", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          region: "CA-ON",
          source_set: "core",
          ...(year === null ? {} : { year }),
          amount: { energy: kwh, energy_unit: "kWh" },
        }),
      });
      if (!response.ok)
        return {
          ok: false,
          error:
            response.status === 401 || response.status === 403
              ? "Climatiq rejected access. Check the saved key and your Electricity Energy API access."
              : response.status === 429
                ? "Climatiq rate limit reached. Please retry later."
                : response.status === 400 || response.status === 422
                  ? "Climatiq cannot calculate these Ontario accounting inputs. Choose another year or latest available."
                  : "Climatiq is temporarily unavailable. Pump scheduling remains functional.",
        };
      const parsed = parseCarbonResponse(await response.json(), year);
      const estimate: CarbonEstimate = {
        ...parsed,
        kwh,
        region: "CA-ON",
        sourceSet: "core",
        requestedYear: year,
        calculatedAt: new Date().toISOString(),
        cached: false,
      };
      if (cache.size >= 100) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { at: Date.now(), estimate });
      return { ok: true, estimate };
    } catch {
      return {
        ok: false,
        error: controller.signal.aborted
          ? "Climatiq timed out. Pump scheduling remains functional."
          : "Climatiq returned an unreadable estimate or could not be reached. No substitute emissions are shown.",
      };
    } finally {
      clearTimeout(timer);
    }
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
