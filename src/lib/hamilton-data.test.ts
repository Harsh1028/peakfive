import { describe, expect, it } from "vitest";
import { HAMILTON_PRODUCTION, HAMILTON_REPORT, productionSummary } from "./hamilton-data";
describe("Published Hamilton 2025 production", () => {
  const expected = [
    ["January", 6776, 219, 273], ["February", 6309, 225, 264], ["March", 7439, 240, 364],
    ["April", 6921, 231, 287], ["May", 6962, 225, 286], ["June", 7311, 244, 286],
    ["July", 7968, 257, 383], ["August", 7483, 241, 415], ["September", 7002, 233, 395],
    ["October", 6650, 215, 327], ["November", 6220, 207, 263], ["December", 6523, 210, 268],
  ];
  it.each(expected)("preserves %s published precision and all three measurements", (month, monthly, average, maximum) => {
    const row = HAMILTON_PRODUCTION.find(row => row.month === month);
    expect(row).toEqual({ month, monthlyMl: monthly, averageDailyMl: average, maximumDailyMl: maximum });
  });
  it("derives annual production only from monthly totals", () => { expect(productionSummary().annualMl).toBe(83584); });
  it("identifies the reported maximum without inventing a day", () => { expect(productionSummary().highestDaily.month).toBe("August"); expect(productionSummary().highestDaily.maximumDailyMl).toBe(415); });
  it("documents reporting 2025 and publication 2026", () => { expect(HAMILTON_REPORT.reportingYear).toBe(2025); expect(HAMILTON_REPORT.publicationYear).toBe(2026); });
});