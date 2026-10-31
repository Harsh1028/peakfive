import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import available from "../test/fixtures/compare-available.json";
import unavailable from "../test/fixtures/compare-unavailable.json";
import { comparisonResponseSchema, DEFAULT_SYSTEM } from "./peakfive-api";
import { SimProvider, useSim } from "./sim-store";

vi.mock("./ieso.functions", () => ({ fetchIesoDay: vi.fn().mockResolvedValue({ ok: false, error: "No historical fixture" }) }));
const compare = vi.hoisted(() => vi.fn());
vi.mock("./peakfive-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./peakfive-api")>(),
  compareRemote: compare,
  checkHealth: vi.fn().mockResolvedValue(undefined),
}));
let store: ReturnType<typeof useSim>;
function Capture() { store = useSim(); return null; }
afterEach(() => vi.clearAllMocks());
describe("shared comparison schedules", () => {
  it("switches baseline playback without changing the optimized Climatiq input and clears edited results", async () => {
    compare.mockResolvedValue(comparisonResponseSchema.parse(available));
    render(<SimProvider><Capture /></SimProvider>);
    await act(async () => { await store.runCompare(); });
    expect(store.comparison?.status).toBe("comparison_available");
    expect(store.activeSchedule?.[0]?.pumps_on).toEqual(["P2"]);
    const carbonInput = store.backendResult;
    await act(async () => { store.setView("baseline"); });
    expect(store.activeSchedule?.[0]?.pumps_on).toEqual([]);
    expect(store.active.eval.kw[0]).toBe(store.comparison?.baseline?.schedule?.[0]?.kw);
    expect(store.backendResult).toBe(carbonInput);
    expect(store.opt?.plan?.eval.kw[0]).toBe(available.optimized.schedule[0].kw);
    await act(async () => { store.setSystem({ ...DEFAULT_SYSTEM, base_load_kw: 31 }); });
    expect(store.comparison).toBeNull(); expect(store.comparisonBaseline).toBeNull();
    expect(store.backendResult).toBeNull(); expect(store.hasSchedule).toBe(false);
  });
  it("never publishes a response after inputs change while waiting", async () => {
    let resolve: ((value: ReturnType<typeof comparisonResponseSchema.parse>) => void) | undefined;
    compare.mockImplementation(() => new Promise((r) => { resolve = r; }));
    render(<SimProvider><Capture /></SimProvider>);
    let pending: Promise<void> | undefined;
    await act(async () => { pending = store.runCompare(); });
    expect(store.comparing).toBe(true);
    await act(async () => { store.setDate("2025-08-01"); });
    await act(async () => { resolve?.(comparisonResponseSchema.parse(available)); await pending; });
    expect(store.comparison).toBeNull(); expect(store.hasSchedule).toBe(false); expect(store.comparing).toBe(false);
  });
  it("unavailable comparisons do not expose the legacy demo baseline as an actual schedule", async () => {
    compare.mockResolvedValue(comparisonResponseSchema.parse(unavailable));
    render(<SimProvider><Capture /></SimProvider>);
    await act(async () => { await store.runCompare(); });
    await waitFor(() => expect(store.comparison?.status).toBe("comparison_unavailable"));
    expect(store.comparisonBaseline).toBeNull(); expect(store.hasSchedule).toBe(false);
    expect(store.backendResult).toBeNull(); expect(store.activeSchedule).toBeNull();
  });
});