// Board proof links + safe auto-linking of plain-text notes. Client-safe: no db.

export const MAX_LINKS_PER_CARD = 10;
export const MAX_LINK_URL_LENGTH = 2000;
export const MAX_LINK_LABEL_LENGTH = 120;

/** Returns the normalised URL string when `raw` is a well-formed http(s) URL, else null. */
export function parseHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > MAX_LINK_URL_LENGTH) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname) return null;
  return u.toString();
}

/** Host only (no www.), for display and audit metadata. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export type LinkInputResult =
  | { ok: true; url: string; label: string | null }
  | { ok: false; error: string };

export function parseLinkInput(body: unknown): LinkInputResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const url = parseHttpUrl(b.url);
  if (!url) return { ok: false, error: "Enter a valid http(s) link (up to 2000 characters)" };
  let label: string | null = null;
  if (b.label !== undefined && b.label !== null) {
    if (typeof b.label !== "string") return { ok: false, error: "Invalid label" };
    const t = b.label.trim();
    if (t.length > MAX_LINK_LABEL_LENGTH) return { ok: false, error: "Label must be 120 characters or fewer" };
    label = t || null;
  }
  return { ok: true, url, label };
}

export type NoteSegment = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}]+$/;

/**
 * Splits plain text into text and link segments. Only http(s) URLs that parse
 * become links; everything else stays text. The caller renders segments as
 * React text nodes, so nothing is ever interpreted as HTML.
 */
export function linkifyNotes(text: string): NoteSegment[] {
  const out: NoteSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let candidate = m[0];
    // Drop trailing punctuation, but keep a closing paren that balances an opening one.
    for (;;) {
      const t = candidate.match(TRAILING);
      if (!t) break;
      const tail = t[0];
      if (tail.startsWith(")") && (candidate.match(/\(/g)?.length ?? 0) >= (candidate.match(/\)/g)?.length ?? 0)) break;
      candidate = candidate.slice(0, -1);
    }
    const href = parseHttpUrl(candidate);
    if (!href) continue;
    if (start > last) out.push({ type: "text", text: text.slice(last, start) });
    out.push({ type: "link", text: candidate, href });
    last = start + candidate.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}
