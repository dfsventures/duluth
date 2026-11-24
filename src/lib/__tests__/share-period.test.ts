import { describe, it, expect } from "vitest";
import { sharePeriodLabel } from "@/lib/share-period";

// B-252: hand-picked-update links have no stored period and used to show "December 1969".
describe("sharePeriodLabel", () => {
  it("keeps the stored period for links made from a date range", () => {
    const label = sharePeriodLabel({
      periodStart: "2026-10-15T12:00:00.000Z",
      periodEnd: "2026-11-15T12:00:00.000Z",
      updates: [{ period: "2025-01" }],
    });
    expect(label).toBe("October 2026 – November 2026");
  });

  it("uses the span of the chosen updates when the link has no period", () => {
    const label = sharePeriodLabel({
      periodStart: null,
      periodEnd: null,
      // API order is newest sent first, which need not match period order
      updates: [{ period: "2026-10" }, { period: "2026-11" }, { period: "2026-09" }],
    });
    expect(label).toBe("Sep 2026 – Nov 2026");
  });

  it("orders mixed period kinds by when they start", () => {
    const label = sharePeriodLabel({
      periodStart: null,
      periodEnd: null,
      updates: [{ period: "2026-Q3" }, { period: "2026-11" }, { period: "2026-H1" }],
    });
    expect(label).toBe("H1 2026 – Nov 2026");
  });

  it("shows a single month when all updates share it", () => {
    const label = sharePeriodLabel({
      periodStart: null,
      periodEnd: null,
      updates: [{ period: "2026-11" }, { period: "2026-11" }],
    });
    expect(label).toBe("Nov 2026");
  });

  it("shows nothing when the link has no period and no updates", () => {
    expect(sharePeriodLabel({ periodStart: null, periodEnd: null, updates: [] })).toBeNull();
  });

  it("never formats a missing period as the epoch", () => {
    const label = sharePeriodLabel({ periodStart: null, periodEnd: null, updates: [{ period: "2026-10" }] });
    expect(label).toBe("Oct 2026");
    expect(label).not.toContain("1969");
  });
});
