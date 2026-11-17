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

// 2026-11-17 (approved by Joseph): a company is only NEW while it has no published updates.
// Marge creates companies with backdated updates, so a company added yesterday can already have
// an update that is hundreds of days old. Synthetic fixtures only.
describe("a company younger than the grace period, with published updates", () => {
  it("no updates: NEW, not overdue (as before)", () => {
    const c = company(1, []);
    expect(cadenceStatus(c)).toBe("NEW");
    expect(isCompanyOverdue(c)).toBe(false);
  });

  it("an update inside the last 30 days: CURRENT, not overdue", () => {
    const c = company(1, [2]);
    expect(cadenceStatus(c)).toBe("CURRENT");
    expect(isCompanyOverdue(c)).toBe(false);
    // a company created 25 days ago whose latest update is 29 days old (backdated): still inside 30
    const d = company(25, [29, 80]);
    expect(cadenceStatus(d)).toBe("CURRENT");
    expect(isCompanyOverdue(d)).toBe(false);
  });

  it("only update is 660 days old (added yesterday): BEHIND, overdue, no longer 'No updates yet'", () => {
    const c = company(1, [660]);
    expect(cadenceStatus(c)).toBe("BEHIND");
    expect(isCompanyOverdue(c)).toBe(true);
  });

  it("rule 2: fewer than 3 updates, latest older than 30 days: BEHIND", () => {
    const c = company(10, [45, 90]);
    expect(isCompanyOverdue(c)).toBe(true);
    expect(cadenceStatus(c)).toBe("BEHIND");
  });

  it("the 30-day line: 29 days old is CURRENT, 31 days old is BEHIND", () => {
    expect(cadenceStatus(company(5, [29]))).toBe("CURRENT");
    expect(cadenceStatus(company(5, [31]))).toBe("BEHIND");
  });

  it("rule 3: three or more updates use the learned cadence when the latest is older than 30 days", () => {
    // Evenly 30 days apart, latest 100 days ago: far past the learned gap.
    const behind = company(10, [100, 130, 160]);
    expect(isCompanyOverdue(behind)).toBe(true);
    expect(cadenceStatus(behind)).toBe("BEHIND");

    // Gaps of ~70 days, latest 31 days ago: inside the learned gap and under two-thirds of it.
    const current = company(10, [31, 100, 170]);
    expect(isCompanyOverdue(current)).toBe(false);
    expect(cadenceStatus(current)).toBe("CURRENT");

    // Gaps of ~80 days, latest 60 days ago: past two-thirds of the gap, not yet past it.
    const aging = company(10, [60, 140, 220]);
    expect(isCompanyOverdue(aging)).toBe(false);
    expect(cadenceStatus(aging)).toBe("AGING");
  });

  it("an unsent (null sentAt) update does not count as published", () => {
    const c: CadenceInput = { createdAt: daysAgo(3), publishedUpdates: [{ sentAt: null }] };
    expect(cadenceStatus(c)).toBe("NEW");
    expect(isCompanyOverdue(c)).toBe(false);
    const d: CadenceInput = { createdAt: daysAgo(3), publishedUpdates: [{ sentAt: null }, { sentAt: daysAgo(400) }] };
    expect(cadenceStatus(d)).toBe("BEHIND");
  });
});

describe("a company 30 days old or more is unchanged", () => {
  it("one recent update is still fewer than 3: BEHIND", () => {
    const c = company(GRACE_PERIOD_DAYS, [2]);
    expect(isCompanyOverdue(c)).toBe(true);
    expect(cadenceStatus(c)).toBe("BEHIND");
  });
  it("no updates: BEHIND, not NEW", () => {
    expect(cadenceStatus(company(GRACE_PERIOD_DAYS + 1, []))).toBe("BEHIND");
  });
});

describe("isCompanyOverdue and cadenceStatus agree", () => {
  it("BEHIND exactly when overdue, across ages and update histories", () => {
    const ages = [0, 1, 15, 29, 30, 31, 90, 400];
    const histories: number[][] = [[], [1], [29], [45], [660], [10, 40], [45, 90], [31, 100, 170], [60, 140, 220], [100, 130, 160], [5, 35, 65, 95, 125], [75, 105, 135, 165, 195]];
    for (const age of ages) {
      for (const h of histories) {
        const c = company(age, h);
        expect(cadenceStatus(c) === "BEHIND").toBe(isCompanyOverdue(c));
      }
    }
  });
});
