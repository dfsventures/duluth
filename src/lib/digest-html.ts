// Part 37, WS104 (F105/F106). Digest section content is stored as a tiny HTML
// subset: <p>, </p>, <br>. Writers escape text before wrapping; readers run
// an allowlist so legacy rows (written unescaped before this fix) are safe too.

/** Plain text (textarea) → stored digest HTML. Escapes &, <, > before wrapping. */
export function plainToDigestHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split("\n\n")
    .filter((p) => p.trim())
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Stored digest HTML → safe HTML. Every "<" that does not open exactly <p>, </p>, <br>, <br/>, <br />
 *  becomes "&lt;". Allowed tags carry no attributes (`<p onclick=…>` does not match). Entities pass through,
 *  so already-escaped content is not double-escaped. */
export function sanitizeDigestHtml(html: string): string {
  return html.replace(/<(?!\/?p>|br\s*\/?>)/gi, "&lt;");
}

/** Stored digest HTML → textarea text (inverse of plainToDigestHtml; fixes F106's nesting). */
export function digestHtmlToPlain(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p>/gi, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
