import { afterEach, describe, expect, it, vi } from "vitest";
import available from "../test/fixtures/compare-available.json";
import unavailable from "../test/fixtures/compare-unavailable.json";
import {
  DEFAULT_SYSTEM, REQUEST_TIMEOUT_MS, compareRemote, comparisonRequest,
  comparisonResponseSchema, comparisonToPlans, type OptimizeRequest,
} from "./peakfive-api";

const request = (): OptimizeRequest => ({
  date: "2025-07-15", system: structuredClone(DEFAULT_SYSTEM), events: [],
  peak_window: { start_slot: 64, end_slot: 80 },
});
const result = () => comparisonResponseSchema.parse(structuredClone(available));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("deployed comparison contract", () => {
  it("sends POST /compare with the exact OpenAPI time-array request and no credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(available)));
    vi.stubGlobal("fetch", fetcher);
    const input = request();
    input.events = [{ type: "fire", start_slot: 68, end_slot: 72, extra_m3_per_slot: 2 }];
    await compareRemote("https://peakfive-api.onrender.com/", input);
    expect(fetcher.mock.calls[0][0]).toBe("https://peakfive-api.onrender.com/compare");
    const options = fetcher.mock.calls[0][1];
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("omit");
    expect(JSON.parse(options.body)).toEqual({ ...input, peak_window: ["16:00", "20:00"] });
  });
  it("preserves midnight and quarter-hour time boundaries", () => {
    const input = request(); input.peak_window = { start_slot: 65, end_slot: 96 };
    expect(comparisonRequest(input).peak_window).toEqual(["16:15", "24:00"]);
  });
  it("validates both genuine 96-slot schedules and exposes API metrics", () => {
    const response = result(); const plans = comparisonToPlans(response, request());
    expect(plans?.baseline.eval.kw).toEqual(response.baseline?.schedule?.map((r) => r.kw));
    expect(plans?.optimized.eval.kw).toEqual(response.optimized?.schedule?.map((r) => r.kw));
    expect(plans?.baseline.eval.levels).toHaveLength(97);
    expect(plans?.optimizedResult.coincident_kw_after).toBe(response.peak_window?.optimized_kw);
    expect(plans?.optimizedResult.coincident_kw_before).toBeNull();
  });
  it("does not substitute schedules or reduction metrics when comparison is unavailable", () => {
    const response = comparisonResponseSchema.parse(unavailable);
    expect(response.peak_window).toBeNull(); expect(response.energy).toBeNull();
    expect(comparisonToPlans(response, request())).toBeNull();
  });
  it.each(["invalid_input", "error"] as const)("handles %s API responses", async (status) => {
    const response = { ...unavailable, status, baseline: null, optimized: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: status === "invalid_input" ? 422 : 500 })));
    const actual = await compareRemote("https://peakfive-api.onrender.com", request());
    expect(actual.status).toBe(status);
    expect(comparisonToPlans(actual, request())).toBeNull();
  });
  it("preserves retry advice on busy service responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...unavailable, status: "error" }), { status: 503, headers: { "Retry-After": "12" } })));
    expect((await compareRemote("https://peakfive-api.onrender.com", request())).explanation).toContain("12 seconds");
  });
  it("rejects partial schedules", () => {
    const response = result(); response.baseline?.schedule?.pop();
    expect(() => comparisonToPlans(response, request())).toThrow(/96-slot/);
  });
  it("rejects missing available metrics instead of inventing values", () => {
    const response = result(); response.peak_window = null;
    expect(() => comparisonToPlans(response, request())).toThrow(/incomplete/);
  });
  it("rejects mismatched reduction percentages", () => {
    const response = result(); if (response.peak_window) response.peak_window.reduction_pct = 99;
    expect(() => comparisonToPlans(response, request())).toThrow(/inconsistent/);
  });
  it("rejects mismatched baseline peak demand", () => {
    const response = result(); if (response.peak_window) response.peak_window.baseline_kw += 1;
    expect(() => comparisonToPlans(response, request())).toThrow(/peak metric/);
  });
  it("rejects baseline constraints that differ from the submitted scenario", () => {
    const input = request(); input.system.pumps[1].available = false;
    expect(() => comparisonToPlans(result(), input)).toThrow(/Pump constraints/);
  });
  it("rejects duplicate pump IDs", () => {
    const response = result(); response.optimized?.schedule?.[0]?.pumps_on.push("P2");
    expect(() => comparisonToPlans(response, request())).toThrow(/duplicate/);
  });
  it("allows feasible-timeout optimized schedules without claiming optimality", () => {
    const response = result(); if (response.optimized) response.optimized.status = "feasible_timeout";
    expect(comparisonToPlans(response, request())?.optimizedResult.status).toBe("feasible_timeout");
  });
  it("rejects malformed service responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "comparison_available" }))));
    await expect(compareRemote("https://peakfive-api.onrender.com", request())).rejects.toThrow(/invalid comparison/);
  });
  it("keeps waiting past 50 seconds and stops at 180 seconds without fallback", async () => {
    vi.useFakeTimers(); let aborted = false;
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
    })));
    const pending = expect(compareRemote("https://peakfive-api.onrender.com", request())).rejects.toThrow(/180 seconds/);
    await vi.advanceTimersByTimeAsync(51000); expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 51000); await pending; expect(aborted).toBe(true);
  });
});