import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allocateCarbon,
  carbonOptionsSchema,
  DEFAULT_CARBON_OPTIONS,
  parseCarbonResponse,
  scheduleEnergy,
} from "./carbon";
import {
  DEFAULT_SYSTEM,
  demandWithEvents,
  type OptimizeRequest,
  type OptimizeResponse,
} from "./peakfive-api";
import { requestCarbon } from "./carbon.server";

const request: OptimizeRequest = {
  date: "2026-07-14",
  peak_window: { start_slot: 64, end_slot: 80 },
  system: DEFAULT_SYSTEM,
  events: [],
};
function fixture(): OptimizeResponse {
  let storage = DEFAULT_SYSTEM.tank.initial_m3;
  const demand = demandWithEvents(request);
  return {
    status: "optimal",
    coincident_kw_before: null,
    coincident_kw_after: 30,
    explanation: "Test fixture only",
    schedule: Array.from({ length: 96 }, (_, slot) => {
      const pumps_on = [
        ...((slot >= 45 && slot <= 50) || slot >= 80 ? ["P1"] : []),
        ...(slot <= 62 || (slot >= 80 && slot <= 94) ? ["P2"] : []),
      ];
      const pumps = DEFAULT_SYSTEM.pumps.filter((p) => pumps_on.includes(p.id));
      const row = {
        slot,
        pumps_on,
        kw: 30 + pumps.reduce((s, p) => s + p.kw, 0),
        tank_m3: storage,
      };
      storage += pumps.reduce((s, p) => s + p.flow_m3h * 0.25, 0) - demand[slot];
      return row;
    }),
  };
}
const provider = (co2e = 100) => ({
  location: {
    consumption: {
      co2e,
      co2e_unit: "kg",
      co2e_calculation_method: "ipcc_ar6_gwp100",
      source_trail: [
        { data_category: "emission_factor", source: "Test source", year: "2023", region: "CA-ON" },
      ],
    },
  },
  notices: [],
});
afterEach(() => vi.unstubAllGlobals());
describe("Carbon accounting", () => {
  it("uses 0.25 hours per interval", () =>
    expect(scheduleEnergy(fixture(), request, DEFAULT_CARBON_OPTIONS).intervals[45]).toBe(32.5));
  it("excludes the 30 kW base load by default", () =>
    expect(scheduleEnergy(fixture(), request, DEFAULT_CARBON_OPTIONS).kwh).toBe(1415));
  it("includes 720 kWh daily facility base load on request", () =>
    expect(
      scheduleEnergy(fixture(), request, { ...DEFAULT_CARBON_OPTIONS, includeBase: true }).kwh,
    ).toBe(2135));
  it("applies a hypothetical multiplier without altering the schedule", () => {
    const result = fixture();
    expect(scheduleEnergy(result, request, { ...DEFAULT_CARBON_OPTIONS, multiplier: 2 }).kwh).toBe(
      2830,
    );
    expect(result.schedule[45].kw).toBe(160);
  });
  it("rejects incomplete schedules", () => {
    const result = fixture();
    result.schedule.pop();
    expect(() => scheduleEnergy(result, request, DEFAULT_CARBON_OPTIONS)).toThrow();
  });
  it("rejects infeasible schedules", () =>
    expect(() =>
      scheduleEnergy({ ...fixture(), status: "infeasible" }, request, DEFAULT_CARBON_OPTIONS),
    ).toThrow());
  it("accepts feasible timeout without changing its status", () => {
    const result = { ...fixture(), status: "feasible_timeout" as const };
    expect(scheduleEnergy(result, request, DEFAULT_CARBON_OPTIONS).kwh).toBe(1415);
    expect(result.status).toBe("feasible_timeout");
  });
  it("does not invent a validated carbon baseline", () =>
    expect(fixture().coincident_kw_before).toBeNull());
  it("interprets location consumption as kg, not market emissions", () =>
    expect(
      parseCarbonResponse({ ...provider(42), market: { consumption: { co2e: 999 } } }, 2023).co2e,
    ).toBe(42));
  it("rejects non-kilogram responses", () => {
    const response = provider();
    response.location.consumption.co2e_unit = "t";
    expect(() => parseCarbonResponse(response, 2023)).toThrow();
  });
  it("discloses mismatching factor years", () =>
    expect(parseCarbonResponse(provider(), 2025).mismatch).toBe(true));
  it("discloses mismatching regions", () => {
    const response = provider();
    response.location.consumption.source_trail[0].region = "CA";
    expect(parseCarbonResponse(response, 2023).mismatch).toBe(true);
  });
  it("allocates annual emissions without inventing hourly intensity", () =>
    expect(allocateCarbon([1, 3], 80)).toEqual([20, 60]));
  it("equal electricity receives equal annual-average allocation", () =>
    expect(allocateCarbon([2, 2], 80)).toEqual([40, 40]));
  it("bounds scenario multipliers", () =>
    expect(
      carbonOptionsSchema.safeParse({ ...DEFAULT_CARBON_OPTIONS, multiplier: 4 }).success,
    ).toBe(false));
  it("calls the official Ontario electricity API with exact consumption and caches exact inputs", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(provider(12))));
    vi.stubGlobal("fetch", fetcher);
    const reply = await requestCarbon(1234, 2023, "test-only-credential");
    expect(reply.ok).toBe(true);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.climatiq.io/energy/v1.4/electricity");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      region: "CA-ON",
      source_set: "core",
      year: 2023,
      amount: { energy: 1234, energy_unit: "kWh" },
    });
    const cached = await requestCarbon(1234, 2023, "test-only-credential");
    expect(cached.ok && cached.estimate.cached).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await requestCarbon(1235, 2023, "test-only-credential");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("returns no fake estimate on API failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    const result = await requestCarbon(111, 2020, "test-only-credential");
    expect(result.ok).toBe(false);
    expect("estimate" in result).toBe(false);
  });
});
