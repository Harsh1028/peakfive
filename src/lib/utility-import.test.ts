import { describe, expect, it } from "vitest";
import { validateUtilityImport } from "./utility-import";
const input = () => ({
  provenance: {
    source: "Utility historian",
    sourceReference: "Export WT-2025-01",
    providedBy: "Utility operator",
    systemName: "Test subsystem",
    systemId: "TEST-001",
    timezone: "America/Toronto",
  },
  intervalMinutes: 15,
  startTimestamp: "2025-01-01T00:00:00-05:00",
  endTimestamp: "2025-01-01T00:15:00-05:00",
  records: [
    {
      timestamp: "2025-01-01T00:00:00-05:00",
      assetId: "P1",
      metric: "pump_power",
      unit: "kW",
      value: 80,
    },
    {
      timestamp: "2025-01-01T00:15:00-05:00",
      assetId: "P1",
      metric: "pump_power",
      unit: "kW",
      value: 0,
    },
  ],
});
describe("Documented operational import", () => {
  it("accepts complete documented measurements without resampling", () => {
    expect(validateUtilityImport(input()).records.map((r) => r.value)).toEqual([80, 0]);
  });
  it.each(["source", "sourceReference", "providedBy", "systemName", "systemId", "timezone"])(
    "requires provenance %s",
    (field) => {
      const data = input();
      Object.assign(data.provenance, { [field]: "" });
      expect(() => validateUtilityImport(data)).toThrow();
    },
  );
  it("rejects missing intervals", () => {
    const data = input();
    data.records.pop();
    expect(() => validateUtilityImport(data)).toThrow(/Missing intervals/);
  });
  it("rejects duplicate timestamps per asset metric", () => {
    const data = input();
    data.records.push(data.records[0]);
    expect(() => validateUtilityImport(data)).toThrow(/Duplicate/);
  });
  it("rejects undocumented timezone offsets", () => {
    const data = input();
    data.records[0].timestamp = "2025-01-01T00:00:00";
    expect(() => validateUtilityImport(data)).toThrow(/explicit UTC offset/);
  });
  it("rejects offsets inconsistent with the declared timezone", () => {
    const data = input();
    data.records[0].timestamp = "2025-01-01T00:00:00-04:00";
    expect(() => validateUtilityImport(data)).toThrow(/time zone/);
  });
  it("rejects nonexistent calendar dates", () => {
    const data = input();
    data.records[0].timestamp = "2025-02-30T00:00:00-05:00";
    expect(() => validateUtilityImport(data)).toThrow(/calendar/);
  });
  it("rejects unsupported units", () => {
    const data = input();
    data.records[0].unit = "MW";
    expect(() => validateUtilityImport(data)).toThrow(/Unsupported unit/);
  });
  it("rejects mixed units within one series", () => {
    const data = input();
    data.records.forEach((r) => {
      r.metric = "pump_flow";
      r.unit = "L/s";
    });
    data.records[1].unit = "m³/h";
    expect(() => validateUtilityImport(data)).toThrow(/consistent/);
  });
  it("rejects pump states other than 0 and 1", () => {
    const data = input();
    data.records.forEach((r) => {
      r.metric = "pump_state";
      r.unit = "boolean";
    });
    expect(() => validateUtilityImport(data)).toThrow(/0 or 1/);
  });
  it("rejects off-interval measurements", () => {
    const data = input();
    data.records[1].timestamp = "2025-01-01T00:14:00-05:00";
    expect(() => validateUtilityImport(data)).toThrow(/off interval/);
  });
  it("rejects negative measurements", () => {
    const data = input();
    data.records[0].value = -1;
    expect(() => validateUtilityImport(data)).toThrow();
  });
  it("supports independent simultaneous series", () => {
    const data = input();
    data.records.push(...data.records.map((r) => ({ ...r, assetId: "P2" })));
    expect(validateUtilityImport(data).records).toHaveLength(4);
  });
});
