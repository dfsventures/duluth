// Memo page, direction B "Dossier" (B-175). Small pure helpers for the new look.

/** The first sentence of a section, for the line a folded section shows. */
export function firstSentence(markdown: string, max = 140): string {
  const plain = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[#>*\-|]+\s*/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const m = plain.match(/^.*?[.!?](?=\s|$)/);
  const s = m ? m[0] : plain;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** "today", "3 days ago", "5 weeks ago", "4 months ago", "2 years ago". Date-only input (YYYY-MM-DD). */
export function relativeAge(iso: string, now: Date = new Date()): string {
  const then = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - then) / 86_400_000);
  if (days < 0) return "upcoming";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30.4)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
