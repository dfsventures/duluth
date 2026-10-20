// Part 40 (WS130, F125). Allowlist sanitizer for investor-update bodies on render.
//
// Update bodies are TipTap HTML written by founders. The editor only produces a known set of tags,
// but PATCH /api/updates/[id] stores whatever it is sent, and /share/[token] (public, same origin as
// the admin app) and /updates/[id] rendered it raw, so a founder could store a <script>. Everything
// is now rendered through this function. It is hand-written like sanitizeBroadcastHtml (which is not
// modified) with the update editor's vocabulary: the tags and attributes StarterKit, Underline,
// Image, Link, TextAlign and the indent extension emit, the class names the editor sets, and
// the in-app image URLs (/api/documents/<id>/view, and the share-scoped /api/share/<token>/doc/<id>
// they are rewritten to). A few harmless structural tags (div, span, table rows) stay so older
// bodies keep their layout. Idempotent: sanitizing its own output changes nothing.
import { safeUrl } from "@/lib/broadcast-html";

const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi;
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

const ALLOWED = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "code", "pre", "blockquote",
  "h1", "h2", "h3", "h4", "ul", "ol", "li", "hr", "a", "img", "span", "div",
  "table", "thead", "tbody", "tr", "th", "td",
]);
const VOID = new Set(["br", "hr", "img"]);
const STYLED = new Set(["p", "h1", "h2", "h3", "h4", "div", "span", "li"]);

// The only class names the editor sets (rich-editor.tsx, portco-mention.ts, fund-snapshot-node.ts).
const CLASS_ALLOW = new Set(["max-w-full", "rounded-md", "my-4", "text-primary", "underline", "portco-mention", "fund-snapshot-block"]);

function attr(raw: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(raw);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}
function escAttr(v: string): string {
  return v.replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function styleAttr(raw: string | null): string {
  if (!raw) return "";
  const out: string[] = [];
  for (const decl of raw.split(";")) {
    const m = /^\s*(text-align|margin-left)\s*:\s*(left|right|center|justify|\d{1,3}(?:\.\d+)?(?:px|em|rem))\s*$/i.exec(decl);
    if (m) out.push(`${m[1].toLowerCase()}: ${m[2].toLowerCase()}`);
  }
  return out.length ? ` style="${out.join("; ")}"` : "";
}
function classAttr(raw: string | null): string {
  if (!raw) return "";
  const keep = raw.split(/\s+/).filter((c) => CLASS_ALLOW.has(c));
  return keep.length ? ` class="${keep.join(" ")}"` : "";
}

/** Image URLs the update editor and the share proxy produce, plus plain https. Nothing else (no data:, no javascript:). */
export function safeUpdateImageSrc(raw: string): string | null {
  const v = raw.trim();
  if (/^\/api\/documents\/[\w-]+\/view$/.test(v)) return v;
  if (/^\/api\/share\/[A-Za-z0-9%_-]+\/doc\/[\w-]+$/.test(v)) return v;
  return safeUrl(raw, false);
}

export function sanitizeUpdateHtml(html: string): string {
  const stripped = (html ?? "").replace(DROP_WITH_CONTENT, "");
  let out = "";
  let last = 0;
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  const escText = (t: string) => t.replace(/</g, "&lt;");
  const anchors: boolean[] = []; // true = we emitted an <a>, so its </a> is kept; false = dropped
  while ((m = TAG.exec(stripped))) {
    out += escText(stripped.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const rest = m[3];
    if (!ALLOWED.has(name)) continue;
    if (closing) {
      if (VOID.has(name)) continue;
      if (name === "a") {
        if (anchors.pop()) out += "</a>";
      } else out += `</${name}>`;
      continue;
    }
    if (name === "a") {
      const href = attr(rest, "href");
      const safe = href !== null ? safeUrl(href, true) : null;
      if (safe) {
        out += `<a href="${escAttr(safe)}" target="_blank" rel="noopener noreferrer"${classAttr(attr(rest, "class"))}>`;
        anchors.push(true);
      } else anchors.push(false);
    } else if (name === "img") {
      const src = attr(rest, "src");
      const safe = src !== null ? safeUpdateImageSrc(src) : null;
      if (!safe) continue;
      const title = attr(rest, "title");
      out += `<img src="${escAttr(safe)}" alt="${escAttr(attr(rest, "alt") ?? "")}"${title !== null ? ` title="${escAttr(title)}"` : ""}${classAttr(attr(rest, "class"))}>`;
    } else if (name === "ol") {
      const start = attr(rest, "start");
      out += start !== null && /^\d{1,4}$/.test(start) ? `<ol start="${start}">` : "<ol>";
    } else if (name === "span") {
      const portco = attr(rest, "data-portco");
      out += `<span${portco !== null && /^[\w-]{1,64}$/.test(portco) ? ` data-portco="${portco}"` : ""}${classAttr(attr(rest, "class"))}${styleAttr(attr(rest, "style"))}>`;
    } else if (name === "th" || name === "td") {
      const align = /text-align\s*:\s*(left|center|right)/i.exec(attr(rest, "style") ?? "");
      out += `<${name}${align ? ` style="text-align: ${align[1].toLowerCase()}"` : ""}>`;
    } else if (STYLED.has(name)) {
      out += `<${name}${styleAttr(attr(rest, "style"))}>`;
    } else {
      out += `<${name}>`;
    }
  }
  out += escText(stripped.slice(last));
  for (const a of anchors) if (a) out += "</a>";
  return out;
}
