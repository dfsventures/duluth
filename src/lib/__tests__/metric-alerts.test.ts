import { describe, it, expect } from "vitest";
import { evaluateCompanyAlerts, type CompanySnapshot } from "@/lib/metric-alerts";

function snap(overrides: Partial<CompanySnapshot> = {}): CompanySnapshot {
  return {
    companyId: "co1",
    companyName: "Acme",
    metricDefinitionCount: 1,
    series: [],
    lastPublishedUpdates: [],
    ...overrides,
  };
}

function series(values: { value: number; date: Date }[]) {
  return {
    metricDefinitionId: "m1",
    name: "MRR",
    unit: "USD",
    values,
  };
}

const D1 = new Date("2026-06-01");
const D2 = new Date("2026-07-01");

describe("evaluateCompanyAlerts — METRIC_CHANGE", () => {
  it("does not fire just under the threshold (19.99%)", () => {
    const s = snap({
      series: [
        series([
          { value: 8_001, date: D2 },
          { value: 10_000, date: D1 },
        ]),
      ],
    });
    expect(evaluateCompanyAlerts(s)).toEqual([]);
  });

  it("fires at exactly the threshold (20%)", () => {
    const s = snap({
      series: [
        series([
          { value: 8_000, date: D2 },
          { value: 10_000, date: D1 },
        ]),
      ],
    });
    const alerts = evaluateCompanyAlerts(s);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].rule).toBe("METRIC_CHANGE");
    expect(alerts[0].message).toContain("-20%");
  });

  it("fires on a positive change (direction-agnostic, Q4b = B)", () => {
    const s = snap({
      series: [
        series([
          { value: 12_000, date: D2 },
          { value: 10_000, date: D1 },
        ]),
      ],
    });
    const alerts = evaluateCompanyAlerts(s);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("+20%");
  });

  it("skips when the previous value is 0 (undefined percentage)", () => {
    const s = snap({
      series: [
        series([
          { value: 100, date: D2 },
          { value: 0, date: D1 },
        ]),
      ],
    });
    expect(evaluateCompanyAlerts(s)).toEqual([]);
  });

  it("skips a series with only one value", () => {
    const s = snap({
      series: [series([{ value: 100, date: D2 }])],
    });
    expect(evaluateCompanyAlerts(s)).toEqual([]);
  });

  it("compares against the next distinct-date value, ignoring same-date duplicates", () => {
    const s = snap({
      series: [
        series([
          { value: 8_000, date: D2 },
          { value: 8_000, date: D2 }, // duplicate on the same date as latest
          { value: 10_000, date: D1 },
        ]),
      ],
    });
    const alerts = evaluateCompanyAlerts(s);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("-20%");
  });

  it("produces a stable dedupeKey for identical input", () => {
    const s = snap({
      series: [
        series([
          { value: 8_000, date: D2 },
          { value: 10_000, date: D1 },
        ]),
      ],
    });
    const first = evaluateCompanyAlerts(s);
    const second = evaluateCompanyAlerts(s);
    expect(first[0].dedupeKey).toBe(second[0].dedupeKey);
    expect(first[0].dedupeKey).toBe(`METRIC_CHANGE:co1:m1:${D2.toISOString()}`);
  });

  it("respects a custom changePct threshold", () => {
    const s = snap({
      series: [
        series([
          { value: 9_000, date: D2 },
          { value: 10_000, date: D1 },
        ]),
      ],
    });
    expect(evaluateCompanyAlerts(s, 20)).toEqual([]);
    expect(evaluateCompanyAlerts(s, 10)).toHaveLength(1);
  });
});

describe("evaluateCompanyAlerts — NO_METRICS_IN_UPDATES", () => {
  it("fires with >=3 published updates, >=1 metric definition, and all-zero metric counts", () => {
    const s = snap({
      metricDefinitionCount: 2,
      lastPublishedUpdates: [
        { id: "u3", metricValueCount: 0 },
        { id: "u2", metricValueCount: 0 },
        { id: "u1", metricValueCount: 0 },
      ],
    });
    const alerts = evaluateCompanyAlerts(s);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].rule).toBe("NO_METRICS_IN_UPDATES");
    expect(alerts[0].dedupeKey).toBe("NO_METRICS_IN_UPDATES:co1:u3");
  });

  it("does not fire with fewer than 3 published updates", () => {
    const s = snap({
      metricDefinitionCount: 2,
      lastPublishedUpdates: [
        { id: "u2", metricValueCount: 0 },
        { id: "u1", metricValueCount: 0 },
      ],
    });
    expect(evaluateCompanyAlerts(s)).toEqual([]);
  });

  it("does not fire when the company has no metric definitions", () => {
    const s = snap({
      metricDefinitionCount: 0,
      lastPublishedUpdates: [
        { id: "u3", metricValueCount: 0 },
        { id: "u2", metricValueCount: 0 },
        { id: "u1", metricValueCount: 0 },
      ],
    });
    expect(evaluateCompanyAlerts(s)).toEqual([]);
  });

  it("does not fire when any of the last 3 updates has metrics attached", () => {
    const s = snap({
      metricDefinitionCount: 2,
      lastPublishedUpdates: [
        { id: "u3", metricValueCount: 0 },
        { id: "u2", metricValueCount: 1 },
        { id: "u1", metricValueCount: 0 },
      ],
    });
    expect(evaluateCompanyAlerts(s)).toEqual([]);
  });
});
