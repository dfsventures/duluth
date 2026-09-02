import { describe, expect, it } from "vitest";
import {
  isCompanyOverdue,
  cadenceStatus,
  GRACE_PERIOD_DAYS,
  type CadenceInput,
} from "@/lib/update-cadence";

// Part 32, WS85 (D1, F68) — synthetic fixtures only: Acme, Northwind.
// Never paste real portfolio data into this file (F74 / the confidentiality
// convention).

const DAY_MS = 1000 * 60 * 60 * 24;
const NOW = Date.now();

function daysAgo(days: number): Date {
  return new Date(NOW - days * DAY_MS);
}

function company(createdAtDaysAgo: number, updateDatesAgo: number[]): CadenceInput {
  return {
    createdAt: daysAgo(createdAtDaysAgo),
    publishedUpdates: updateDatesAgo.map((d) => ({ sentAt: daysAgo(d) })),
  };
}

describe("isCompanyOverdue (pre-refactor regression table)", () => {
  // Acme — inside the grace period, zero updates. Must never be flagged,
  // this is D1's whole point: a brand-new company is not "overdue".
  it("a brand-new company (Acme) with zero updates inside the grace period is not overdue", () => {
    const acme = company(GRACE_PERIOD_DAYS - 1, []);
    expect(isCompanyOverdue(acme)).toBe(false);
  });

  // Northwind — past grace, fewer than 3 published updates ever.
  it("past grace with fewer than 3 published updates ever (Northwind) is overdue", () => {
    const northwind = company(200, [10, 60]);
    expect(isCompanyOverdue(northwind)).toBe(true);
  });

  it("a steady ~30-day cadence just met is not overdue", () => {
    // Five updates roughly 30 days apart, most recent 29 days ago — just
    // inside the learned average gap.
    const acme = company(365, [29, 60, 90, 120, 150]);
    expect(isCompanyOverdue(acme)).toBe(false);
  });

  it("the same ~30-day cadence, now missed, is overdue", () => {
    // Same historical cadence, but the most recent update is much further
    // back than the learned ~30-day average gap.
    const acme = company(365, [75, 105, 135, 165, 195]);
    expect(isCompanyOverdue(acme)).toBe(true);
  });

  it("exactly three updates (the MIN_UPDATES_FOR_CADENCE boundary) uses the cadence rule, not the count rule", () => {
    // Exactly 3 updates, evenly spaced ~30 days, most recent just inside —
    // should NOT be flagged by "fewer than 3" (it has exactly 3) and should
    // pass the cadence check.
    const northwind = company(200, [29, 59, 89]);
    expect(isCompanyOverdue(northwind)).toBe(false);
  });

  it("agrees with the pre-refactor dashboard-route implementation on a table of inputs", () => {
    // This is a byte-identical-behaviour regression check: these are the
    // same rules that lived inline in api/admin/dashboard/route.ts before
    // the extraction. Re-implementing the old logic here inline and
    // comparing would be circular, so instead this table pins down the
    // documented rule boundaries directly (see Rule 1/2/3 comments in
    // update-cadence.ts).
    const cases: { input: CadenceInput; expected: boolean }[] = [
      { input: company(5, []), expected: false }, // Rule 1: grace period
      { input: company(29, []), expected: false }, // still inside grace (29 < 30)
      { input: company(30, []), expected: true }, // just past grace, 0 updates
      { input: company(90, [10, 40]), expected: true }, // Rule 2: <3 updates past grace
      { input: company(365, [29, 60, 90, 120, 150]), expected: false }, // Rule 3: cadence met
      { input: company(365, [75, 105, 135, 165, 195]), expected: true }, // Rule 3: cadence missed
    ];
    for (const { input, expected } of cases) {
      expect(isCompanyOverdue(input)).toBe(expected);
    }
  });
});

describe("cadenceStatus", () => {
  it("returns NEW for a company inside the grace period with zero updates (D1 — neutral, never red)", () => {
    const acme = company(GRACE_PERIOD_DAYS - 1, []);
    expect(cadenceStatus(acme)).toBe("NEW");
  });

  it("returns BEHIND for a company past grace with fewer than 3 updates", () => {
    const northwind = company(200, [10, 60]);
    expect(cadenceStatus(northwind)).toBe("BEHIND");
  });

  it("returns CURRENT for a steady cadence just met, well within the window", () => {
    const acme = company(365, [5, 35, 65, 95, 125]);
    expect(cadenceStatus(acme)).toBe("CURRENT");
  });

  it("returns AGING once past roughly two-thirds of the learned cadence but not yet overdue", () => {
    // Learned average gap ~30 days; most recent update 22 days ago is past
    // 2/3 of 30 (=20) but not yet past the full 30-day gap, so not overdue.
    const northwind = company(365, [22, 52, 82, 112, 142]);
    expect(isCompanyOverdue(northwind)).toBe(false);
    expect(cadenceStatus(northwind)).toBe("AGING");
  });

  it("returns BEHIND once the cadence is missed", () => {
    const acme = company(365, [75, 105, 135, 165, 195]);
    expect(cadenceStatus(acme)).toBe("BEHIND");
  });
});
