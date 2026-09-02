// Part 32, WS85 — ONE definition of "behind on updates". Lifted verbatim
// from api/admin/dashboard/route.ts, which had the considered version
// (30-day grace, min-3-updates, learned cadence over the last 5) while
// admin/companies/page.tsx had a naive 90/30/null rule. F68: the two
// could disagree about the same company on the same day.
// Convention (Part 32, C02): danger/laterite = requires intervention.
// A never-happened-yet state is neutral or info, NEVER danger.
//
// Pure and DB-free by design — callers pass company age and published-update
// dates; nothing here imports from @/lib/db, so this can be unit-tested with
// synthetic fixtures and shared between the dashboard route and the
// companies list page without either one depending on the other.

export const GRACE_PERIOD_DAYS = 30;
export const MIN_UPDATES_FOR_CADENCE = 3;
export const CADENCE_LOOKBACK = 5;

export type CadenceStatus = "NEW" | "CURRENT" | "AGING" | "BEHIND";

export interface CadenceInput {
  createdAt: Date;
  publishedUpdates: { sentAt: Date | null }[];
}

/**
 * Byte-identical behaviourally to the pre-refactor dashboard-route
 * implementation — do not change this function's logic without also
 * re-verifying the dashboard's "Companies Overdue" count against real data,
 * since that count must not move as a side effect of this extraction.
 */
export function isCompanyOverdue(company: CadenceInput): boolean {
  const now = Date.now();
  const ageMs = now - company.createdAt.getTime();
  const ageInDays = ageMs / (1000 * 60 * 60 * 24);

  // Rule 1: grace period — never flag a new company
  if (ageInDays < GRACE_PERIOD_DAYS) return false;

  const dates = company.publishedUpdates
    .map((u) => u.sentAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime()); // most recent first

  // Rule 2: past grace period but fewer than 3 published updates → flag
  if (dates.length < MIN_UPDATES_FOR_CADENCE) return true;

  // Rule 3: calculate cadence from last 5 published updates
  const recent = dates.slice(0, CADENCE_LOOKBACK);
  let totalGapMs = 0;
  for (let i = 0; i < recent.length - 1; i++) {
    totalGapMs += recent[i].getTime() - recent[i + 1].getTime();
  }
  const avgGapMs = totalGapMs / (recent.length - 1);
  const timeSinceLastMs = now - recent[0].getTime();

  return timeSinceLastMs > avgGapMs;
}

/**
 * Richer status for badge rendering. Extends isCompanyOverdue's boolean with
 * a "NEW" state (inside the grace period — D1: neutral, never red) and an
 * "AGING" state (past roughly two-thirds of the learned cadence but not yet
 * overdue by the shared rule), so a badge can warn before it accuses.
 */
export function cadenceStatus(company: CadenceInput): CadenceStatus {
  const now = Date.now();
  const ageMs = now - company.createdAt.getTime();
  const ageInDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageInDays < GRACE_PERIOD_DAYS) return "NEW";

  if (isCompanyOverdue(company)) return "BEHIND";

  const dates = company.publishedUpdates
    .map((u) => u.sentAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  // isCompanyOverdue is false here, and past the grace period, so there must
  // be at least MIN_UPDATES_FOR_CADENCE dates (otherwise it would be BEHIND).
  const recent = dates.slice(0, CADENCE_LOOKBACK);
  let totalGapMs = 0;
  for (let i = 0; i < recent.length - 1; i++) {
    totalGapMs += recent[i].getTime() - recent[i + 1].getTime();
  }
  const avgGapMs = totalGapMs / (recent.length - 1);
  const timeSinceLastMs = now - recent[0].getTime();

  if (timeSinceLastMs > avgGapMs * (2 / 3)) return "AGING";

  return "CURRENT";
}
