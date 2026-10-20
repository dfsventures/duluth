// Share-link expiry choices, shared by Investor Links (admin and founder pages) and memo share links.
export const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Never", days: null },
];

/** ISO timestamp `days` from now, or null for "Never". */
export function expiryFromDays(days: number | null, now: Date = new Date()): string | null {
  return days === null ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
