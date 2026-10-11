// Founder-facing read view of admin broadcasts. Broadcast bodies are admin-authored
// TipTap HTML (the email path trusts it); this allowlist sanitizer makes the in-app
// read view safe regardless: unknown tags are dropped (text kept), script-like
// elements are dropped with their content, and attributes are limited to a few
// vetted ones.

const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

const ALLOWED = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "code", "pre", "blockquote",
  "h2", "h3", "h4", "ul", "ol", "li", "hr", "a", "img", "span",
]);
const VOID = new Set(["br", "hr", "img"]);

function attr(raw: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(raw);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

function escAttr(v: string): string {
  return v.replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeBasic(v: string): string {
  return v.replace(/&amp;/gi, "&").replace(/&#x?[0-9a-f]+;/gi, "").replace(/&colon;/gi, ":").replace(/&tab;|&newline;/gi, "");
}

/** Only http(s), mailto and (for images) https — anything else is dropped. */
export function safeUrl(raw: string, allowMailto: boolean): string | null {
  const v = decodeBasic(raw).replace(/[\u0000- ]/g, "");
  if (/^https?:\/\//i.test(v)) return raw.trim();
  if (allowMailto && /^mailto:/i.test(v)) return raw.trim();
  return null;
}

function safeStyle(raw: string | null): string {
  if (!raw) return "";
  const out: string[] = [];
  for (const decl of raw.split(";")) {
    const m = /^\s*(text-align|margin-left)\s*:\s*(left|right|center|justify|\d{1,3}(?:\.\d+)?(?:px|em|rem))\s*$/i.exec(decl);
    if (m) out.push(`${m[1].toLowerCase()}: ${m[2].toLowerCase()}`);
  }
  return out.length ? ` style="${out.join("; ")}"` : "";
}

export function sanitizeBroadcastHtml(html: string): string {
  const stripped = html.replace(DROP_WITH_CONTENT, "");
  let out = "";
  let last = 0;
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  const escText = (t: string) => t.replace(/</g, "&lt;");
  while ((m = TAG.exec(stripped))) {
    out += escText(stripped.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const rest = m[3];
    if (!ALLOWED.has(name)) continue;
    if (closing) {
      if (!VOID.has(name)) out += `</${name}>`;
      continue;
    }
    if (name === "a") {
      const href = attr(rest, "href");
      const safe = href !== null ? safeUrl(href, true) : null;
      out += safe ? `<a href="${escAttr(safe)}" target="_blank" rel="noopener noreferrer">` : "<a>";
    } else if (name === "img") {
      const src = attr(rest, "src");
      const safe = src !== null ? safeUrl(src, false) : null;
      if (!safe) continue;
      out += `<img src="${escAttr(safe)}" alt="${escAttr(attr(rest, "alt") ?? "")}">`;
    } else if (VOID.has(name)) {
      out += `<${name}>`;
    } else if (name === "p" || name === "h2" || name === "h3" || name === "h4" || name === "span") {
      out += `<${name}${safeStyle(attr(rest, "style"))}>`;
    } else {
      out += `<${name}>`;
    }
  }
  out += escText(stripped.slice(last));
  return out;
}
