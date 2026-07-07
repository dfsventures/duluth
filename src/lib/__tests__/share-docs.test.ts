import { describe, it, expect } from "vitest";
import { rewriteDocumentUrls } from "@/lib/share-docs";

describe("rewriteDocumentUrls", () => {
  it("rewrites an inline image URL to the token-scoped proxy", () => {
    const html = '<p>Hi</p><img src="/api/documents/clx123abc/view" alt="chart">';
    expect(rewriteDocumentUrls(html, "tok_456")).toBe(
      '<p>Hi</p><img src="/api/share/tok_456/doc/clx123abc" alt="chart">'
    );
  });

  it("rewrites every occurrence, not just the first", () => {
    const html =
      '<img src="/api/documents/aaa/view"><img src="/api/documents/bbb/view">';
    const out = rewriteDocumentUrls(html, "t");
    expect(out).toBe('<img src="/api/share/t/doc/aaa"><img src="/api/share/t/doc/bbb">');
  });

  it("leaves bodies without document URLs untouched", () => {
    const html = "<h2>Q2</h2><p>MRR grew. <a href=\"https://example.com\">link</a></p>";
    expect(rewriteDocumentUrls(html, "tok")).toBe(html);
  });

  it("does not touch other /api/documents URLs (only the /view form)", () => {
    const html = '<a href="/api/documents/upload">upload</a>';
    expect(rewriteDocumentUrls(html, "tok")).toBe(html);
  });

  it("URI-encodes the token", () => {
    const html = '<img src="/api/documents/abc/view">';
    expect(rewriteDocumentUrls(html, "a/b?c")).toBe(
      '<img src="/api/share/a%2Fb%3Fc/doc/abc">'
    );
  });

  it("handles an empty body", () => {
    expect(rewriteDocumentUrls("", "tok")).toBe("");
  });
});
