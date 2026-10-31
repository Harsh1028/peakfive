import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SYSTEM,
  configuredApiUrl,
  REQUEST_TIMEOUT_MS,
  checkHealth,
  demandWithEvents,
  normalizeApiUrl,
  optimizeRemote,
  peakContains,
  scheduleToPlan,
  validateRequest,
  type OptimizeRequest,
  type OptimizeResponse,
} from "./peakfive-api";

const request = (): OptimizeRequest => ({
  date: "2025-07-15",
  peak_window: { start_slot: 64, end_slot: 80 },
  system: structuredClone(DEFAULT_SYSTEM),
  events: [],
});
function fixture(req = request()): OptimizeResponse {
  let storage = req.system.tank.initial_m3;
  const demand = demandWithEvents(req);
  const schedule = Array.from({ length: 96 }, (_, slot) => {
    const pumps_on = [
      ...((slot >= 45 && slot <= 50) || slot >= 80 ? ["P1"] : []),
      ...(slot <= 62 || (slot >= 80 && slot <= 94) ? ["P2"] : []),
    ];
    const pumps = req.system.pumps.filter((p) => pumps_on.includes(p.id));
    const row = {
      slot,
      pumps_on,
      kw: req.system.base_load_kw + pumps.reduce((s, p) => s + p.kw, 0),
      tank_m3: storage,
    };
    storage += pumps.reduce((s, p) => s + p.flow_m3h * 0.25, 0) - demand[slot];
    return row;
  });
  return {
    status: "optimal",
    schedule,
    coincident_kw_before: null,
    coincident_kw_after: 30,
    explanation: "Fixture only",
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("FastAPI contract", () => {
  it("reads the production Render address from Vite configuration", () => {
    vi.stubEnv("VITE_PEAKFIVE_API", "https://peakfive-api.onrender.com");
    expect(configuredApiUrl()).toBe("https://peakfive-api.onrender.com");
  });
  it("uses the exact pump defaults", () => {
    expect(DEFAULT_SYSTEM.pumps.map((p) => [p.id, p.kw, p.flow_m3h])).toEqual([
      ["P1", 80, 100],
      ["P2", 50, 65],
    ]);
  });
  it("uses the specified tank defaults", () => {
    expect(DEFAULT_SYSTEM.tank).toEqual({
      capacity_m3: 1200,
      initial_m3: 850,
      min_operating_m3: 200,
      fire_reserve_m3: 250,
    });
  });
  it("includes 30 kW essential load", () => {
    expect(DEFAULT_SYSTEM.base_load_kw).toBe(30);
  });
  it("preserves the Hamilton-inspired synthetic 24-hour profile at approximately 1817 m³", () => {
    expect(DEFAULT_SYSTEM.slot_minutes).toBe(15);
    expect(DEFAULT_SYSTEM.demand_m3_per_slot).toHaveLength(96);
    expect(DEFAULT_SYSTEM.demand_m3_per_slot.reduce((a, b) => a + b, 0)).toBeCloseTo(1817.044, 3);
  });
  it("preserves the Hamilton-inspired 450 m³ storage floor", () => {
    expect(DEFAULT_SYSTEM.tank.min_operating_m3 + DEFAULT_SYSTEM.tank.fire_reserve_m3).toBe(450);
  });
  it("requires exactly 96 demand values", () => {
    expect(validateRequest(request()).system.demand_m3_per_slot).toHaveLength(96);
    const r = request();
    r.system.demand_m3_per_slot.pop();
    expect(() => validateRequest(r)).toThrow();
  });
  it("uses start-of-slot levels and calculates 24:00", () => {
    const r = request();
    const result = fixture(r);
    const p = scheduleToPlan(result, r);
    expect(p.eval.levels[0]).toBe(850);
    expect(p.eval.levels[95]).toBeCloseTo(840.907);
    expect(p.eval.levels[96]).toBeCloseTo(850.456);
    expect(p.eval.levels).toHaveLength(97);
  });
  it("includes overlapping fire demand and clips at midnight", () => {
    const r = request();
    r.events = [
      { type: "fire", start_slot: 94, end_slot: 100, extra_m3_per_slot: 30 },
      { type: "fire", start_slot: 95, end_slot: 96, extra_m3_per_slot: 25 },
    ];
    const d = demandWithEvents(r);
    expect(d[93]).toBe(r.system.demand_m3_per_slot[93]);
    expect(d[95]).toBeCloseTo(70.451);
  });
  it("includes last-slot fire demand in final storage", () => {
    const r = request();
    r.events = [{ type: "fire", start_slot: 95, end_slot: 96, extra_m3_per_slot: 0.2 }];
    const result = fixture(r);
    expect(scheduleToPlan(result, r).eval.finalLevel).toBeCloseTo(850.256);
  });
  it("rejects pump outage violations", () => {
    const r = request();
    r.events = [{ type: "pump_outage", pump_id: "P1", start_slot: 45, end_slot: 51 }];
    expect(() => scheduleToPlan(fixture(), r)).toThrow(/Pump constraints/);
  });
  it("keeps fire reserve above operating minimum", () => {
    const r = request();
    r.system.tank.fire_reserve_m3 = 700;
    expect(() => scheduleToPlan(fixture(), r)).toThrow(/Reservoir limits/);
  });
  it("preserves peak-only demand without a savings baseline", () => {
    const r = request();
    const result = fixture();
    expect(result.coincident_kw_before).toBeNull();
    expect(result.coincident_kw_after).toBe(30);
    expect(scheduleToPlan(result, r).eval.peakKwh).toBe(120);
  });
  it("supports wrapping and empty peak windows", () => {
    expect(peakContains(95, 88, 8)).toBe(true);
    expect(peakContains(4, 88, 8)).toBe(true);
    expect(peakContains(40, 88, 8)).toBe(false);
    expect(peakContains(64, 64, 64)).toBe(false);
  });
  it("rejects partial schedules", () => {
    const r = fixture();
    r.schedule.pop();
    expect(() => scheduleToPlan(r, request())).toThrow(/96-slot/);
  });
  it("accepts feasible timeout schedules without proving optimality", () => {
    const r = fixture();
    r.status = "feasible_timeout";
    expect(scheduleToPlan(r, request()).validation.pass).toBe(true);
    expect(r.status).toBe("feasible_timeout");
  });
  it.each(["infeasible", "timeout_no_solution", "invalid_input", "error"] as const)(
    "never draws a %s schedule",
    (status) => {
      expect(() => scheduleToPlan({ ...fixture(), status, schedule: [] }, request())).toThrow();
    },
  );
  it("requires explicit API configuration, never defaults to localhost", () => {
    expect(() => normalizeApiUrl("")).toThrow();
    expect(normalizeApiUrl("https://api.example.com/")).toBe("https://api.example.com");
  });
  it("calls health", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
    vi.stubGlobal("fetch", fetcher);
    await checkHealth("https://api.example.com");
    expect(fetcher.mock.calls[0][0]).toBe("https://api.example.com/health");
  });
  it("sends the current exact optimization request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture())));
    vi.stubGlobal("fetch", fetcher);
    const r = request();
    await optimizeRemote("https://api.example.com", r);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.example.com/optimize");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(r);
  });
  it("reads invalid-input HTTP responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "invalid_input",
            schedule: [],
            coincident_kw_before: null,
            coincident_kw_after: null,
            explanation: "Bad input",
          }),
          { status: 422 },
        ),
      ),
    );
    expect((await optimizeRemote("https://api.example.com", request())).status).toBe(
      "invalid_input",
    );
  });
  it("aborts at exactly 45 seconds without a simulated fallback", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
          ),
      ),
    );
    expect(REQUEST_TIMEOUT_MS).toBe(45000);
    const pending = expect(optimizeRemote("https://api.example.com", request())).rejects.toThrow(
      /45 seconds/,
    );
    await vi.advanceTimersByTimeAsync(45000);
    await pending;
  });
});
