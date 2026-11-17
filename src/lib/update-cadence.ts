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

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Rule 1 (grace period), as amended on 2026-11-17: a company younger than
 * GRACE_PERIOD_DAYS is only given the grace period while it has no published
 * updates (NEW) or has published one within the last GRACE_PERIOD_DAYS
 * (CURRENT, never overdue). A young company whose latest published update is
 * older than that — Marge adds companies with backdated updates — is judged by
 * rules 2 and 3 exactly like an older company. Returns the grace outcome, or
 * null when the normal rules apply. Shared by isCompanyOverdue and
 * cadenceStatus so the two cannot disagree.
 */
function graceOutcome(company: CadenceInput, dates: Date[], now: number): "NEW" | "CURRENT" | null {
  const ageInDays = (now - company.createdAt.getTime()) / DAY_MS;
  if (ageInDays >= GRACE_PERIOD_DAYS) return null;
  if (dates.length === 0) return "NEW";
  const sinceLatestInDays = (now - dates[0].getTime()) / DAY_MS;
  return sinceLatestInDays < GRACE_PERIOD_DAYS ? "CURRENT" : null;
}

/** Published update dates, most recent first. */
function publishedDates(company: CadenceInput): Date[] {
  return company.publishedUpdates
    .map((u) => u.sentAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());
}

/**
 * The shared "behind on updates" rule behind the dashboard's "Companies
 * Overdue" count and the Companies list.
 *
 * Intentional change on 2026-11-17 (approved by Joseph): the 30-day grace
 * period no longer protects a young company that already has published
 * updates, all of them old (see graceOutcome). A company 30+ days old behaves
 * exactly as before, and so does a young company with no updates or with a
 * recent one. So the dashboard's overdue count can go up by the number of
 * young companies whose only updates are older than 30 days.
 */
export function isCompanyOverdue(company: CadenceInput): boolean {
  const now = Date.now();
  const dates = publishedDates(company);

  // Rule 1: grace period — never flag a new company (or a young one with a recent update)
  if (graceOutcome(company, dates, now) !== null) return false;

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
 * a "NEW" state (inside the grace period with no updates yet — D1: neutral,
 * never red; a young company with a recent update is CURRENT, see graceOutcome) and an
 * "AGING" state (past roughly two-thirds of the learned cadence but not yet
 * overdue by the shared rule), so a badge can warn before it accuses.
 */
export function cadenceStatus(company: CadenceInput): CadenceStatus {
  const now = Date.now();
  const dates = publishedDates(company);

  // A company is only "NEW" while it has no updates; one with a recent update is CURRENT.
  const grace = graceOutcome(company, dates, now);
  if (grace !== null) return grace;

  if (isCompanyOverdue(company)) return "BEHIND";

  // isCompanyOverdue is false here, and the grace rule did not apply, so there
  // must be at least MIN_UPDATES_FOR_CADENCE dates (otherwise it would be BEHIND).
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
