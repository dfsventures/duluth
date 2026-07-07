import { describe, it, expect } from "vitest";
import {
  buildMetricDateFilter,
  buildMetricSummary,
  endOfDayUTC,
} from "@/lib/share-metrics";

const start = new Date("2026-04-01T00:00:00.000Z");
const end = new Date("2026-06-30T00:00:00.000Z");

describe("endOfDayUTC", () => {
  it("normalizes to the last instant of the UTC day without mutating the input", () => {
    const input = new Date("2026-06-30T09:15:00.000Z");
    const result = endOfDayUTC(input);
    expect(result.toISOString()).toBe("2026-06-30T23:59:59.999Z");
    expect(input.toISOString()).toBe("2026-06-30T09:15:00.000Z");
  });
});

describe("buildMetricDateFilter", () => {
  it("PERIOD scope with a full period filters to the range, end-of-day inclusive", () => {
    const filter = buildMetricDateFilter({
      metricScope: "PERIOD",
      periodStart: start,
      periodEnd: end,
      hasSelectedUpdates: true,
    });
    expect(filter).toEqual({
      date: { gte: start, lte: new Date("2026-06-30T23:59:59.999Z") },
    });
  });

  it.each([
    ["missing periodStart", null, end],
    ["missing periodEnd", start, null],
  ])("PERIOD scope with %s falls back to ALL_TIME semantics", (_label, ps, pe) => {
    const filter = buildMetricDateFilter({
      metricScope: "PERIOD",
      periodStart: ps,
      periodEnd: pe,
      hasSelectedUpdates: true,
    });
    expect(filter).toEqual({});
  });

  // REGRESSION (Q1 = B contract): every link that existed before
  // metricScope was added must behave byte-identically to before.
  it("ALL_TIME + pinned updates → no date filter (pre-WS12 pinned-link behavior)", () => {
    const filter = buildMetricDateFilter({
      metricScope: "ALL_TIME",
      periodStart: start,
      periodEnd: end,
      hasSelectedUpdates: true,
    });
    expect(filter).toEqual({});
  });

  it("ALL_TIME legacy period-only link → raw period range (pre-WS12 legacy behavior, no end-of-day widening)", () => {
    const filter = buildMetricDateFilter({
      metricScope: "ALL_TIME",
      periodStart: start,
      periodEnd: end,
      hasSelectedUpdates: false,
    });
    expect(filter).toEqual({ date: { gte: start, lte: end } });
  });

  it("ALL_TIME with no period and no pinned updates → no date filter", () => {
    const filter = buildMetricDateFilter({
      metricScope: "ALL_TIME",
      periodStart: null,
      periodEnd: null,
      hasSelectedUpdates: false,
    });
    expect(filter).toEqual({});
  });
});

describe("buildMetricSummary", () => {
  const row = (
    companyId: string,
    name: string,
    value: number | string | { toString(): string },
    dateIso: string,
    unit: string | null = "USD"
  ) => ({
    value,
    date: new Date(dateIso),
    metricDefinition: { name, unit, companyId },
  });

  it("keeps only the first (latest, given desc-sorted input) value per company+metric", () => {
    const summary = buildMetricSummary([
      row("c1", "MRR", 90000, "2026-07-01T00:00:00.000Z"),
      row("c1", "MRR", 50000, "2026-05-01T00:00:00.000Z"),
      row("c1", "TPV", 120, "2026-06-01T00:00:00.000Z"),
      row("c2", "MRR", 7, "2026-06-15T00:00:00.000Z"),
    ]);
    expect(summary.c1).toEqual([
      { name: "MRR", unit: "USD", value: 90000, date: "2026-07-01T00:00:00.000Z" },
      { name: "TPV", unit: "USD", value: 120, date: "2026-06-01T00:00:00.000Z" },
    ]);
    expect(summary.c2).toEqual([
      { name: "MRR", unit: "USD", value: 7, date: "2026-06-15T00:00:00.000Z" },
    ]);
  });

  it("same metric name on different companies does not collide", () => {
    const summary = buildMetricSummary([
      row("c1", "MRR", 1, "2026-06-01T00:00:00.000Z"),
      row("c2", "MRR", 2, "2026-06-01T00:00:00.000Z"),
    ]);
    expect(summary.c1?.[0].value).toBe(1);
    expect(summary.c2?.[0].value).toBe(2);
  });

  it("coerces Decimal-like values (objects with toString) to numbers", () => {
    const decimalLike = { toString: () => "12500.5" };
    const summary = buildMetricSummary([
      row("c1", "MRR", decimalLike, "2026-06-01T00:00:00.000Z"),
    ]);
    expect(summary.c1?.[0].value).toBe(12500.5);
  });

  it("returns an empty object for no rows", () => {
    expect(buildMetricSummary([])).toEqual({});
  });
});
