// Part 40 (WS125.3). The one place memo markdown becomes HTML. Pure, server-side.
// Two layers (JC-MM-C): markdown-it with raw HTML off, images turned into their alt text and only
// http(s)/mailto links; then sanitizeMemoHtml, a table-aware allowlist, as defence in depth.
// The app page, the share page and print all use renderMemoMarkdown, so they cannot drift.
import MarkdownIt from "markdown-it";
import { safeUrl } from "@/lib/broadcast-html";
import type { MemoCitation } from "@/lib/memos";

export type MemoSurface = "app" | "share";

// JC-MM-D. A host matches if it equals an entry or is a subdomain of it ("acme.notion.site").
export const INTERNAL_HOSTS = [
  "molly.dfs.vc",
  "molly.dfslab.net",
  "granola.ai",
  "notion.so",
  "notion.site",
  "docs.google.com",
  "drive.google.com",
  "slack.com",
] as const;

export function isInternalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return INTERNAL_HOSTS.some((x) => h === x || h.endsWith(`.${x}`));
}
function hostOfUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false });
md.validateLink = (url: string) => safeUrl(url, true) !== null;

// Headings in section text sit under the section's own h2: h1/h2 -> h3, h3 and below -> h4.
md.core.ruler.push("memo_shift_headings", (state) => {
  for (const t of state.tokens) {
    if (t.type === "heading_open" || t.type === "heading_close") {
      const level = Number(t.tag.slice(1));
      t.tag = level <= 2 ? "h3" : "h4";
    }
  }
});

// Share surface: links to internal hosts keep their text but lose the href.
md.core.ruler.push("memo_mark_links", (state) => {
  const surface = (state.env as { surface?: MemoSurface } | undefined)?.surface ?? "app";
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children) continue;
    const stack: boolean[] = [];
    for (const t of block.children) {
      if (t.type === "link_open") {
        const href = t.attrGet("href") ?? "";
        const host = hostOfUrl(href);
        const strip = surface === "share" && host !== null && isInternalHost(host);
        stack.push(strip);
        t.meta = { strip };
      } else if (t.type === "link_close") {
        t.meta = { strip: stack.pop() ?? false };
      }
    }
  }
});

md.renderer.rules.link_open = (tokens, idx) => {
  const t = tokens[idx];
  if (t.meta?.strip) return "";
  const href = t.attrGet("href") ?? "";
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
};
md.renderer.rules.link_close = (tokens, idx) => (tokens[idx].meta?.strip ? "" : "</a>");
// Images are never rendered (no tracking pixels, no remote content): the alt text stays.
md.renderer.rules.image = (tokens, idx) => escapeHtml(tokens[idx].content);
// No `language-x` classes; the sanitizer would drop them anyway.
md.renderer.rules.fence = (tokens, idx) => `<pre><code>${escapeHtml(tokens[idx].content)}</code></pre>\n`;

// ── sanitizer ─────────────────────────────────────────────────────────────────────────────
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi;
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ALLOWED = new Set([
  "p", "br", "strong", "em", "s", "code", "pre", "blockquote", "h3", "h4", "ul", "ol", "li", "hr",
  "a", "table", "thead", "tbody", "tr", "th", "td",
]);
const VOID = new Set(["br", "hr"]);

function attr(raw: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(raw);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}
function escAttr(v: string): string {
  return v.replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function alignStyle(raw: string | null): string {
  if (!raw) return "";
  const m = /^\s*text-align\s*:\s*(left|center|right)\s*;?\s*$/i.exec(raw);
  return m ? ` style="text-align: ${m[1].toLowerCase()}"` : "";
}

export function sanitizeMemoHtml(html: string): string {
  const stripped = html.replace(DROP_WITH_CONTENT, "");
  let out = "";
  let last = 0;
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  const escText = (t: string) => t.replace(/</g, "&lt;");
  const open: string[] = []; // anchors we kept open, so a dropped <a> never leaves a stray </a>
  while ((m = TAG.exec(stripped))) {
    out += escText(stripped.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (!ALLOWED.has(name)) continue;
    if (closing) {
      if (VOID.has(name)) continue;
      if (name === "a") {
        if (open.pop() === "a") out += "</a>";
      } else out += `</${name}>`;
      continue;
    }
    if (name === "a") {
      const href = attr(m[3], "href");
      const safe = href !== null ? safeUrl(href, true) : null;
      if (safe) {
        out += `<a href="${escAttr(safe)}" target="_blank" rel="noopener noreferrer nofollow">`;
        open.push("a");
      } else {
        open.push("");
      }
    } else if (name === "th" || name === "td") {
      out += `<${name}${alignStyle(attr(m[3], "style"))}>`;
    } else {
      out += `<${name}>`;
    }
  }
  out += escText(stripped.slice(last));
  for (const a of open) if (a === "a") out += "</a>";
  return out;
}

/** Markdown in, safe HTML out. `surface: "share"` also removes internal-host hrefs (JC-MM-D). */
export function renderMemoMarkdown(src: string, opts: { surface: MemoSurface }): string {
  return sanitizeMemoHtml(md.render(src, { surface: opts.surface }));
}

/** Citations for a share surface: a URL survives only for kind "web" on a non-internal host. */
export function shareableCitations(citations: MemoCitation[]): MemoCitation[] {
  return citations.map((c) => {
    const { url, ...rest } = c;
    if (c.kind === "web" && url) {
      const host = hostOfUrl(url);
      if (host && !isInternalHost(host)) return { ...rest, url };
    }
    return rest;
  });
}
