// Part 45. Pure rules for founder updates filed from email (Marge) and companies with no founder yet.
// No DB access, no email: safe to import anywhere.

export const UPDATE_SOURCES = ["FOUNDER", "EMAIL_VIA_MARGE"] as const;
export type UpdateSource = (typeof UPDATE_SOURCES)[number];

export const PERIOD_RE = /^\d{4}(-(Q[1-4]|H[12]|0[1-9]|1[0-2]))?$/;

/** YYYY, YYYY-Hn, YYYY-Qn, YYYY-MM → UTC [start, end], end = last instant of the last day. */
export function periodWindow(period: string): { start: Date; end: Date } | null {
  if (typeof period !== "string" || !PERIOD_RE.test(period)) return null;
  const year = parseInt(period.slice(0, 4), 10);
  let firstMonth = 0; // 0-based
  let months = 12;
  const rest = period.slice(5);
  if (rest) {
    if (rest[0] === "Q") {
      firstMonth = (parseInt(rest[1], 10) - 1) * 3;
      months = 3;
    } else if (rest[0] === "H") {
      firstMonth = (parseInt(rest[1], 10) - 1) * 6;
      months = 6;
    } else {
      firstMonth = parseInt(rest, 10) - 1;
      months = 1;
    }
  }
  const start = new Date(Date.UTC(year, firstMonth, 1, 0, 0, 0, 0));
  // Day 0 of the month after the window = last day of the window.
  const end = new Date(Date.UTC(year, firstMonth + months, 0, 23, 59, 59, 999));
  return { start, end };
}

/** JC-FU-C: the email's date as an instant, 12:00 UTC. Input is YYYY-MM-DD. */
export const emailDateToInstant = (d: string) => new Date(`${d}T12:00:00.000Z`);

export type ValueSource = "founder" | "admin" | "marge";

export function valueSource(v: {
  via: string | null;
  enteredById: string | null;
  updateCreatorIsAdmin: boolean | null;
}): ValueSource {
  if (v.via === "marge") return "marge";
  if (v.enteredById || v.updateCreatorIsAdmin) return "admin";
  return "founder"; // includes legacy web entries with no author: protected either way
}

/** JC-FU-A: a company has a founder when any member is not an admin. */
export const hasFounderWhere = {
  memberships: { some: { user: { NOT: { roles: { has: "ADMIN" } } } } },
} as const;

export const companyHasFounder = (members: { user: { roles: string[] } }[]) =>
  members.some((m) => !m.user.roles.includes("ADMIN"));

/** Lowercase host without "www."; null when unparsable. Used by the guard and company_match. */
export function websiteHost(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    return host && host.includes(".") ? host : null;
  } catch {
    return null;
  }
}
