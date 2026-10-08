import { describe, it, expect } from "vitest";
import { plainToDigestHtml, sanitizeDigestHtml, digestHtmlToPlain } from "@/lib/digest-html";

// Part 37, WS104 (F105/F106) — digest section content is stored as a tiny HTML
// subset. Writers escape; readers allowlist.

describe("plainToDigestHtml / digestHtmlToPlain", () => {
  it("round-trips paragraphs, line breaks and special characters", () => {
    const x = "First para\nsecond line\n\nAcme & <b>Co</b> said \"hi\" it's fine";
    expect(digestHtmlToPlain(plainToDigestHtml(x))).toBe(x);
  });

  it("does not nest <p> across repeated edit cycles (F106)", () => {
    let html = plainToDigestHtml("One\n\nTwo");
    for (let i = 0; i < 3; i++) html = plainToDigestHtml(digestHtmlToPlain(html));
    expect(html).toBe("<p>One</p><p>Two</p>");
  });

  it("escapes markup on write", () => {
    expect(plainToDigestHtml("<script>alert(1)</script> & x")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; x</p>"
    );
  });

  it("drops empty paragraphs", () => {
    expect(plainToDigestHtml("a\n\n\n\nb")).toBe("<p>a</p><p>b</p>");
  });
});

describe("sanitizeDigestHtml", () => {
  it("neutralizes script, img onerror, p with attributes and anchors", () => {
    for (const evil of [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<p onclick=alert(1)>x</p>",
      '<a href="https://evil.example">x</a>',
    ]) {
      const out = sanitizeDigestHtml(evil);
      expect(out).not.toMatch(/<(script|img|a)\b/i);
      expect(out).not.toMatch(/<p\s/i);
    }
  });

  it("leaves <p> and <br> intact", () => {
    const ok = "<p>a<br>b<br/>c<br />d</p>";
    expect(sanitizeDigestHtml(ok)).toBe(ok);
  });

  it("does not double-escape existing entities", () => {
    expect(sanitizeDigestHtml("<p>Q &amp; A &lt;ok&gt;</p>")).toBe("<p>Q &amp; A &lt;ok&gt;</p>");
  });

  it("renders a legacy unescaped row's <b> as text", () => {
    expect(sanitizeDigestHtml("<p>Acme <b>x</b></p>")).toBe("<p>Acme &lt;b>x&lt;/b></p>");
  });
});
