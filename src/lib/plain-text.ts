// Part 39 (WS121). TipTap/digest HTML -> plain text for tool results. Pure, DB-free.
// Block tags become line breaks, every other tag is removed (text kept), script-like elements
// are dropped with their content (as in broadcast-html.ts), common entities are decoded, runs of
// blank lines collapse, and the result is cut at `max` characters.

const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAG = /<\/?(?:p|li|h[1-6]|blockquote|pre|ul|ol|div|tr)\b[^>]*>/gi;
const BR_TAG = /<br\b[^>]*>/gi;
const ANY_TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name: string) => {
    const lower = name.toLowerCase();
    if (lower in NAMED) return NAMED[lower];
    if (lower.startsWith("#x")) {
      const n = parseInt(lower.slice(2), 16);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    if (lower.startsWith("#")) {
      const n = parseInt(lower.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return whole;
  });
}

export const TRUNCATION_MARK = "… (truncated)";

export function htmlToPlainText(html: string, max: number): string {
  let s = (html ?? "")
    .replace(DROP_WITH_CONTENT, "")
    .replace(BR_TAG, "\n")
    .replace(BLOCK_TAG, "\n")
    .replace(ANY_TAG, "");
  // Decode after tags are gone, so an encoded "&lt;b&gt;" stays literal text.
  s = decodeEntities(s)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length > max) return s.slice(0, max).trimEnd() + TRUNCATION_MARK;
  return s;
}
