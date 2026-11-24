import { formatPeriod } from "@/lib/utils";

/**
 * B-252: the line under an investor share link's title.
 *
 * Links made from a date range keep their stored period ("October 2026 – November 2026").
 * Links made from hand-picked updates have no stored period (periodStart/periodEnd are null),
 * and the page used to format null as the epoch ("December 1969"). For those, show the span of
 * the updates the link actually includes, in the same short form the update cards use
 * ("Oct 2026 – Nov 2026", or one label when the earliest and latest match). No updates (or no
 * readable periods) gives null, and the page shows nothing there.
 */
export function sharePeriodLabel(input: {
  periodStart: string | Date | null;
  periodEnd: string | Date | null;
  updates: { period: string }[];
}): string | null {
  const { periodStart, periodEnd, updates } = input;
  if (periodStart && periodEnd) {
    const fmt = (d: string | Date) =>
      new Date(d).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return `${fmt(periodStart)} – ${fmt(periodEnd)}`;
  }

  const keyed = updates
    .map((u) => ({ period: u.period, key: periodSortKey(u.period) }))
    .filter((p): p is { period: string; key: number } => p.key !== null)
    .sort((a, b) => a.key - b.key);
  if (keyed.length === 0) return null;

  const first = formatPeriod(keyed[0].period);
  const last = formatPeriod(keyed[keyed.length - 1].period);
  return first === last ? first : `${first} – ${last}`;
}

/** Months since year 0 for the start of a period string ("2026-10", "2026-Q3", "2026-H2", "2026"). */
function periodSortKey(period: string): number | null {
  const m = period.match(/^(\d{4})(?:-(\d{2})|-Q([1-4])|-H([12]))?$/);
  if (!m) return null;
  const year = parseInt(m[1]);
  let month = 0;
  if (m[2]) month = parseInt(m[2]) - 1;
  else if (m[3]) month = (parseInt(m[3]) - 1) * 3;
  else if (m[4]) month = (parseInt(m[4]) - 1) * 6;
  return year * 12 + month;
}
