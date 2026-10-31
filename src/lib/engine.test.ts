import { describe, expect, it } from "vitest";
import {
  baselineSchedule, CAPACITY, comboKw, DEFAULT_CONFIG, DEMAND, evaluate, ILLUSTRATIVE_HOURLY, inPeak, optimize, validate,
} from "./engine";
import { extractDay } from "./ieso";

const H = ILLUSTRATIVE_HOURLY;
const cfg = DEFAULT_CONFIG;

describe("engine", () => {
  it("synthetic demand totals 1,082 m³", () => {
    expect(DEMAND.reduce((a, b) => a + b, 0)).toBe(1082);
  });
  it("1. baseline is feasible under default config", () => {
    expect(validate(baselineSchedule(cfg), cfg).pass).toBe(true);
  });
  const base = baselineSchedule(cfg);
  const baseEval = evaluate(base, cfg, H);
  const res = optimize(cfg, H, { minFinal: baseEval.finalLevel });
  const optEval = evaluate(res.combos!, cfg, H);
  it("2. optimized schedule passes independent validation", () => {
    expect(res.feasible).toBe(true);
    expect(validate(res.combos!, cfg, { minFinal: baseEval.finalLevel }).pass).toBe(true);
  });
  it("3/4/5. capacity, reserve and final target respected", () => {
    expect(Math.max(...optEval.levels)).toBeLessThanOrEqual(CAPACITY);
    expect(Math.min(...optEval.levels.slice(1))).toBeGreaterThanOrEqual(cfg.minReserve);
    expect(optEval.finalLevel).toBeGreaterThanOrEqual(Math.max(cfg.finalTarget, baseEval.finalLevel));
  });
  it("optimizer reduces peak-window energy vs baseline", () => {
    expect(optEval.peakKwh).toBeLessThan(baseEval.peakKwh);
  });
  it("6. unavailable pumps never operate", () => {
    const c = { ...cfg, pump2: false };
    const r = optimize(c, H);
    if (r.feasible) expect(r.combos!.every((x) => !(x & 2))).toBe(true);
    expect(baselineSchedule(c).every((x) => !(x & 2))).toBe(true);
  });
  it("7. pump 1 failure is infeasible with a reason", () => {
    const r = optimize({ ...cfg, pump1: false }, H);
    expect(r.feasible).toBe(false);
    expect(r.reason).toMatch(/Pump 1 unavailable/);
  });
  it("8. no flexibility yields no artificial improvement", () => {
    const r = optimize({ ...cfg, freeze: true }, H, { frozen: base });
    expect(r.combos).toEqual(base);
    expect(evaluate(r.combos!, cfg, H).peakKwh).toBe(baseEval.peakKwh);
  });
  it("9. more flexibility never gives a worse objective", () => {
    const frozen = optimize(cfg, H, { frozen: base });
    expect(optEval.objective).toBeLessThanOrEqual(evaluate(frozen.combos!, cfg, H).objective + 1e-9);
  });
  it("10. moving the risk window changes the schedule", () => {
    const c2 = { ...cfg, peakStart: 7, peakEnd: 11 };
    const r2 = optimize(c2, H);
    expect(r2.combos).not.toEqual(res.combos);
    const e2 = evaluate(r2.combos!, c2, H);
    expect(e2.peakKwh).toBeLessThan(evaluate(baselineSchedule(c2), c2, H).peakKwh);
  });
  it("11. energy figures match the pump states", () => {
    const daily = res.combos!.reduce((a, c) => a + comboKw(c) * 0.25, 0);
    const peak = res.combos!.reduce((a, c, t) => a + (inPeak(t, cfg) ? comboKw(c) * 0.25 : 0), 0);
    expect(optEval.dailyKwh).toBeCloseTo(daily);
    expect(optEval.peakKwh).toBeCloseTo(peak);
  });
});

describe("IESO import", () => {
  const header = "\\Hourly Demand Report\n\\Created\nDate,Hour,Market Demand,Ontario Demand\n";
  it("12. accepts 24 valid hourly readings", () => {
    const rows = Array.from({ length: 24 }, (_, i) => `2026-07-14,${i + 1},17000,${15000 + i}`).join("\n");
    const r = extractDay(header + rows, "2026-07-14");
    expect(r.ok && r.hourly.length).toBe(24);
    expect(r.ok && r.hourly[0]).toBe(15000);
  });
  it("12. rejects incomplete days and bad columns", () => {
    const rows = Array.from({ length: 20 }, (_, i) => `2026-07-14,${i + 1},17000,15000`).join("\n");
    expect(extractDay(header + rows, "2026-07-14").ok).toBe(false);
    expect(extractDay("Date,Hour,Foo\n2026-07-14,1,2", "2026-07-14").ok).toBe(false);
  });
});
