import { describe, it, expect } from "vitest";
import { parseHttpUrl, parseLinkInput, linkifyNotes, hostOf, MAX_LINK_URL_LENGTH } from "@/lib/board-links";

describe("parseHttpUrl", () => {
  it("accepts http and https", () => {
    expect(parseHttpUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(parseHttpUrl("  http://example.com ")).toBe("http://example.com/");
  });
  it("rejects dangerous or non-http schemes", () => {
    for (const u of ["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://x.com", "file:///etc/passwd", "vbscript:x", "//example.com", "example.com"]) {
      expect(parseHttpUrl(u)).toBeNull();
    }
  });
  it("rejects non-strings, empty and over-long", () => {
    expect(parseHttpUrl(null)).toBeNull();
    expect(parseHttpUrl(5)).toBeNull();
    expect(parseHttpUrl("")).toBeNull();
    expect(parseHttpUrl("https://example.com/" + "a".repeat(MAX_LINK_URL_LENGTH))).toBeNull();
  });
});

describe("parseLinkInput", () => {
  it("trims and nulls an empty label", () => {
    expect(parseLinkInput({ url: "https://example.com", label: "  Doc  " })).toMatchObject({ ok: true, label: "Doc" });
    expect(parseLinkInput({ url: "https://example.com", label: "   " })).toMatchObject({ ok: true, label: null });
    expect(parseLinkInput({ url: "https://example.com" })).toMatchObject({ ok: true, label: null });
  });
  it("rejects long labels and bad urls", () => {
    expect(parseLinkInput({ url: "https://example.com", label: "x".repeat(121) }).ok).toBe(false);
    expect(parseLinkInput({ url: "https://example.com", label: 3 }).ok).toBe(false);
    expect(parseLinkInput({ url: "javascript:alert(1)" }).ok).toBe(false);
    expect(parseLinkInput(null).ok).toBe(false);
  });
});

describe("hostOf", () => {
  it("strips www", () => expect(hostOf("https://www.example.com/x")).toBe("example.com"));
});

describe("linkifyNotes", () => {
  it("returns plain text unchanged", () => {
    expect(linkifyNotes("hello world")).toEqual([{ type: "text", text: "hello world" }]);
  });
  it("links http(s) urls and drops trailing punctuation", () => {
    const segs = linkifyNotes("See https://example.com/a, then (http://example.org/b).");
    const links = segs.filter((s) => s.type === "link");
    expect(links.map((l) => l.text)).toEqual(["https://example.com/a", "http://example.org/b"]);
    expect(segs.map((s) => s.text).join("")).toBe("See https://example.com/a, then (http://example.org/b).");
  });
  it("keeps a balanced closing paren in the url", () => {
    const l = linkifyNotes("https://en.example.org/wiki/Foo_(bar)").find((s) => s.type === "link");
    expect(l?.text).toBe("https://en.example.org/wiki/Foo_(bar)");
  });
  it("never links javascript:, data: or html, and keeps markup as inert text", () => {
    const input = 'javascript:alert(1) data:text/html,x <a href="javascript:alert(1)">x</a> <script>alert(1)</script>';
    const segs = linkifyNotes(input);
    expect(segs.every((s) => s.type === "text")).toBe(true);
    expect(segs.map((s) => s.text).join("")).toBe(input);
  });
  it("a link-looking url inside html is only ever a text/href pair, never markup", () => {
    const segs = linkifyNotes('<img src=x onerror=alert(1)> https://example.com/"onmouseover="x');
    for (const s of segs) if (s.type === "link") expect(s.href.startsWith("https://")).toBe(true);
    expect(segs.map((s) => s.text).join("")).toContain("<img src=x onerror=alert(1)>");
  });
});
