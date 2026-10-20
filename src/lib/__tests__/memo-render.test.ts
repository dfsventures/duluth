import { describe, it, expect } from "vitest";
import { renderMemoMarkdown, sanitizeMemoHtml, shareableCitations, isInternalHost } from "@/lib/memo-render";

// Part 40 (WS125): the XSS corpus runs through both surfaces. Nothing here may produce a live
// script, event handler, javascript:/data: link or remote image.

const SURFACES = ["app", "share"] as const;
const render = (s: string, surface: "app" | "share" = "app") => renderMemoMarkdown(s, { surface });

const DANGER = [/<script/i, /<img/i, /<iframe/i, /<style/i, /<svg/i, /<object/i, /<embed/i, /<form/i, /<input/i];
const TAG_NAMES = new Set(["p", "br", "strong", "em", "s", "code", "pre", "blockquote", "h3", "h4", "ul", "ol", "li", "hr", "a", "table", "thead", "tbody", "tr", "th", "td"]);
// Every real tag in the output must be allowlisted, carry only href/target/rel/style, and have a
// safe href. Escaped text (&lt;img onerror=...&gt;) is not a tag and is allowed to read like one.
function expectSafe(html: string) {
  for (const re of DANGER) expect(html, String(re)).not.toMatch(re);
  for (const tag of html.match(/<\/?[a-zA-Z][^>]*>/g) ?? []) {
    const name = /^<\/?([a-zA-Z0-9]+)/.exec(tag)![1].toLowerCase();
    expect(TAG_NAMES.has(name), tag).toBe(true);
    for (const am of tag.matchAll(/\s([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
      expect(["href", "target", "rel", "style"], tag).toContain(am[1].toLowerCase());
      if (am[1].toLowerCase() === "href") expect(am[2], tag).toMatch(/^(https?:\/\/|mailto:)/i);
      if (am[1].toLowerCase() === "style") expect(am[2], tag).toMatch(/^text-align: (left|center|right)$/);
    }
    // nothing left over once quoted attributes are removed
    expect(tag.replace(/\s[a-zA-Z-]+\s*=\s*"[^"]*"/g, ""), tag).toMatch(/^<\/?[a-zA-Z0-9]+\s*\/?>$/);
  }
}

const CORPUS: [string, string][] = [
  ["script tag", `Hello <script>alert(1)</script> world`],
  ["script with attributes", `<script src="https://evil.example/x.js"></script>`],
  ["img onerror", `<img src=x onerror=alert(1)>`],
  ["img onerror quoted", `<img src="x" onerror="alert(document.cookie)">`],
  ["svg onload", `<svg onload=alert(1)></svg>`],
  ["iframe", `<iframe src="https://evil.example"></iframe>`],
  ["style block", `<style>body{display:none}</style>`],
  ["raw anchor javascript", `<a href="javascript:alert(1)">x</a>`],
  ["raw anchor entity javascript", `<a href="&#106;avascript:alert(1)">x</a>`],
  ["md link javascript", `[x](javascript:alert(1))`],
  ["md link javascript mixed case", `[x](JaVaScRiPt:alert(1))`],
  ["md link javascript with whitespace", `[x](java\tscript:alert(1))`],
  ["md link entity javascript", `[x](&#106;avascript:alert(1))`],
  ["md link hex entity javascript", `[x](&#x6A;avascript:alert(1))`],
  ["md link data", `[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)`],
  ["md link vbscript", `[x](vbscript:msgbox(1))`],
  ["md reference javascript", `[x][r]\n\n[r]: javascript:alert(1)`],
  ["autolink javascript", `<javascript:alert(1)>`],
  ["md image remote", `![tracker](https://evil.example/pixel.gif)`],
  ["md image javascript", `![x](javascript:alert(1))`],
  ["md image data", `![x](data:image/svg+xml;base64,AAAA)`],
  ["attribute breakout in link", `[x](https://example.com/" onmouseover="alert(1))`],
  ["attribute breakout in title", `[x](https://example.com "t\\" onmouseover=\\"alert(1)")`],
  ["html comment", `<!-- --><script>alert(1)</script>`],
  ["unterminated tag", `<img src=x onerror=alert(1)`],
  ["details ontoggle", `<details open ontoggle=alert(1)>x</details>`],
  ["table cell html", `| a | b |\n|---|---|\n| <img src=x onerror=alert(1)> | <script>x</script> |`],
  ["code fence with html", "```html\n<script>alert(1)</script>\n```"],
  ["inline code html", "`<img src=x onerror=alert(1)>`"],
  ["link text html", `[<img src=x onerror=alert(1)>](https://example.com)`],
  ["math", `<math><mi xlink:href="javascript:alert(1)">x</mi></math>`],
];

describe("renderMemoMarkdown: XSS corpus", () => {
  for (const surface of SURFACES) {
    for (const [name, src] of CORPUS) {
      it(`${surface}: ${name}`, () => {
        expectSafe(render(src, surface));
      });
    }
  }

  it("shows script and onerror as visible text, not markup", () => {
    const html = render(`<img src=x onerror=alert(1)> and <script>alert(1)</script>`);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps the text of a blocked javascript: link but not a link", () => {
    const html = render(`[click me](javascript:alert(1))`);
    expect(html).not.toContain("<a");
    expect(html).toContain("click me");
  });

  it("a markdown image becomes its alt text and never an img", () => {
    const html = render(`![company logo](https://example.com/logo.png)`);
    expect(html).not.toContain("<img");
    expect(html).toContain("company logo");
    expect(html).not.toContain("logo.png");
  });

  it("an attribute breakout stays inside the href", () => {
    const html = render(`[x](https://example.com/" onmouseover="alert(1))`);
    expect(html).not.toMatch(/<a[^>]*\sonmouseover=/i);
  });
});

describe("renderMemoMarkdown: formatting", () => {
  it("renders GFM tables with alignment", () => {
    const html = render(`| Market | TAM |\n|:--|--:|\n| Africa | $10B |`);
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain('<th style="text-align: left">Market</th>');
    expect(html).toContain('<td style="text-align: right">$10B</td>');
  });

  it("renders strikethrough, lists, bold, italics, quotes and code", () => {
    const html = render(`**b** *i* ~~gone~~\n\n- one\n- two\n\n> quote\n\n\`code\``);
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<em>i</em>");
    expect(html).toContain("<s>gone</s>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<code>code</code>");
  });

  it("shifts headings under the section's own h2", () => {
    const html = render(`# One\n\n## Two\n\n### Three\n\n#### Four`);
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
    expect(html).toContain("<h3>One</h3>");
    expect(html).toContain("<h3>Two</h3>");
    expect(html).toContain("<h4>Three</h4>");
    expect(html).toContain("<h4>Four</h4>");
  });

  it("gives http links target and rel, and linkifies bare URLs", () => {
    const html = render(`[a](https://example.com/x) and https://example.org`);
    expect(html).toContain('<a href="https://example.com/x" target="_blank" rel="noopener noreferrer nofollow">a</a>');
    expect(html).toContain('href="https://example.org"');
  });

  it("allows mailto links", () => {
    expect(render(`[mail](mailto:jane@example.com)`)).toContain('href="mailto:jane@example.com"');
  });

  it("empty input renders empty", () => {
    expect(render("")).toBe("");
  });
});

describe("share surface: internal URLs", () => {
  const links = [
    "[a](https://molly.dfs.vc/admin/companies/c1)",
    "[b](https://notion.so/page)",
    "[c](https://acme.notion.site/memo)",
    "[d](https://docs.google.com/document/d/1)",
    "[e](https://drive.google.com/file/d/1)",
    "[f](https://app.slack.com/client/T1)",
    "[g](https://granola.ai/notes/1)",
    "[h](https://team.slack.com/archives/C1)",
  ];
  it("removes the href but keeps the text", () => {
    for (const l of links) {
      const html = render(l, "share");
      expect(html, l).not.toContain("href");
      expect(html, l).not.toContain("<a");
      expect(html, l).toBe(`<p>${l[1]}</p>\n`);
    }
    expect(render("see [the page](https://notion.so/page) now", "share")).toBe("<p>see the page now</p>\n");
  });
  it("the app surface keeps them", () => {
    for (const l of links) expect(render(l, "app")).toContain("href=");
  });
  it("keeps external links on the share surface, and handles nesting", () => {
    const html = render("[**bold** one](https://notion.so/x) [ext](https://example.com)", "share");
    expect(html).toContain("<strong>bold</strong> one");
    expect(html).toContain('href="https://example.com"');
    expect(html.match(/<a /g)?.length).toBe(1);
    expect(html.match(/<\/a>/g)?.length).toBe(1);
  });
  it("a bare internal URL is not left as a link either", () => {
    expect(render("https://molly.dfs.vc/admin/memos/m1", "share")).not.toContain("href");
  });
  it("lookalike hosts are not treated as internal", () => {
    expect(isInternalHost("notion.so.evil.example")).toBe(false);
    expect(isInternalHost("evilnotion.so")).toBe(false);
    expect(isInternalHost("www.notion.so")).toBe(true);
  });
});

describe("shareableCitations", () => {
  it("keeps a URL only for kind web on an external host", () => {
    const out = shareableCitations([
      { label: "Press", kind: "web", url: "https://example.com/article" },
      { label: "Wiki", kind: "web", url: "https://acme.notion.site/x" },
      { label: "Drive", kind: "web", url: "https://drive.google.com/x" },
      { label: "Call", kind: "call", date: "2026-10-01", url: "https://granola.ai/n/1" },
      { label: "Deck", kind: "deck", url: "https://example.com/deck.pdf" },
      { label: "Bad", kind: "web", url: "not a url" },
    ]);
    expect(out[0].url).toBe("https://example.com/article");
    expect(out[1]).toEqual({ label: "Wiki", kind: "web" });
    expect(out[2]).toEqual({ label: "Drive", kind: "web" });
    expect(out[3]).toEqual({ label: "Call", kind: "call", date: "2026-10-01" });
    expect(out[4]).toEqual({ label: "Deck", kind: "deck" });
    expect(out[5]).toEqual({ label: "Bad", kind: "web" });
  });
});

describe("sanitizeMemoHtml", () => {
  it("drops script-like elements with their content", () => {
    expect(sanitizeMemoHtml("<p>a</p><script>alert(1)</script><style>x{}</style><iframe src=x></iframe>")).toBe("<p>a</p>");
  });
  it("drops unknown tags but keeps their text, and escapes stray <", () => {
    expect(sanitizeMemoHtml("<blink>hi</blink> 1 < 2")).toBe("hi 1 &lt; 2");
    expect(sanitizeMemoHtml("<img src=x onerror=alert(1)")).toBe("&lt;img src=x onerror=alert(1)");
  });
  it("strips every attribute except a safe href and alignment", () => {
    expect(sanitizeMemoHtml('<p class="x" onclick="a()" style="color:red">t</p>')).toBe("<p>t</p>");
    expect(sanitizeMemoHtml('<a href="https://example.com" onclick="a()">t</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">t</a>'
    );
  });
  it("drops an anchor with a dangerous href but keeps its text and balances tags", () => {
    expect(sanitizeMemoHtml('<a href="javascript:alert(1)">t</a>')).toBe("t");
    expect(sanitizeMemoHtml('<a href="&#106;avascript:alert(1)">t</a>')).toBe("t");
    expect(sanitizeMemoHtml('<a href=" jav&#x09;ascript:alert(1)">t</a>')).toBe("t");
    expect(sanitizeMemoHtml('<a href="data:text/html,x">t</a>')).toBe("t");
    expect(sanitizeMemoHtml('<a href="https://example.com">t')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">t</a>'
    );
  });
  it("table alignment is a closed set: injection through style is removed", () => {
    expect(sanitizeMemoHtml('<table><tr><th style="text-align:center">a</th></tr></table>')).toBe(
      '<table><tr><th style="text-align: center">a</th></tr></table>'
    );
    expect(sanitizeMemoHtml('<td style="text-align:left;background:url(javascript:alert(1))">a</td>')).toBe("<td>a</td>");
    expect(sanitizeMemoHtml('<td style="text-align:left" onclick="x()">a</td>')).toBe('<td style="text-align: left">a</td>');
    expect(sanitizeMemoHtml('<td style=\'text-align:"><script>alert(1)</script>\'>a</td>')).toBe("<td>a</td>");
  });
  it("img, svg, form and h1/h2 are not in the allowlist", () => {
    expect(sanitizeMemoHtml('<img src="https://example.com/x.png"><form><input></form><h1>x</h1><h2>y</h2>')).toBe("xy");
  });
});
