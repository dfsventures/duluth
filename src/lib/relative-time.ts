// "5 min ago", "3 h ago", "2 d ago", then a plain date. Pure; `now` is injectable
// for tests. Used where the exact timestamp stays available on hover.

export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const then = new Date(date).getTime();
  const diffMs = now.getTime() - then;
  if (!Number.isFinite(then)) return "";
  if (diffMs < 0) return "just now";
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d} d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
