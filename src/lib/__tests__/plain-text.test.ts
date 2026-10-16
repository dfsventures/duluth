import { describe, it, expect } from "vitest";
import { htmlToPlainText, TRUNCATION_MARK } from "@/lib/plain-text";

describe("htmlToPlainText", () => {
  it("turns block tags into line breaks and removes other tags", () => {
    expect(htmlToPlainText("<p>First <strong>bold</strong></p><p>Second<br>line</p>", 500)).toBe("First bold\n\nSecond\nline");
  });
  it("handles TipTap lists and headings", () => {
    const html = "<h2>Highlights</h2><ul><li><p>Signed Acme</p></li><li><p>Hired two</p></li></ul>";
    expect(htmlToPlainText(html, 500)).toBe("Highlights\n\nSigned Acme\n\nHired two");
  });
  it("keeps link text, drops the href", () => {
    expect(htmlToPlainText('<p>See <a href="https://example.com/x">the deck</a></p>', 500)).toBe("See the deck");
  });
  it("drops script and style bodies with their content", () => {
    expect(htmlToPlainText("<p>ok</p><script>alert('x')</script><style>p{}</style><p>fine</p>", 500)).toBe("ok\n\nfine");
  });
  it("decodes named and numeric entities, and keeps an encoded tag literal", () => {
    expect(htmlToPlainText("<p>A &amp; B &lt;b&gt; &quot;q&quot; it&#39;s&nbsp;x &#65; &#x42;</p>", 500)).toBe('A & B <b> "q" it\'s x A B');
  });
  it("collapses runs of blank lines", () => {
    expect(htmlToPlainText("<p>a</p><p></p><p></p><p></p><p>b</p>", 500)).toBe("a\n\nb");
  });
  it("truncates at max with a marker", () => {
    const out = htmlToPlainText(`<p>${"x".repeat(100)}</p>`, 10);
    expect(out).toBe("x".repeat(10) + TRUNCATION_MARK);
  });
  it("plain text passes through and empty input is empty", () => {
    expect(htmlToPlainText("just text", 50)).toBe("just text");
    expect(htmlToPlainText("", 50)).toBe("");
  });
  it("does not choke on a stray angle bracket", () => {
    expect(htmlToPlainText("<p>1 < 2</p>", 50)).toContain("1 < 2");
  });
});
