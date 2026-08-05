import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 24, WS54 / F47 — sendLpReportPublishedEmail's HTML output. The route
// test (report-publish-notify.test.ts) mocks this function entirely to pin
// the notify-loop behavior; this file exercises the real function directly
// (mocking only the Resend SDK) to pin the actual HTML it produces: the
// escaping fix for reportTitle/lpName (F47), the optional note paragraph,
// and the byte-identical-when-empty contract for the "It's a short read."
// removal.

const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => mockSend(...args) };
  },
}));

import { sendLpReportPublishedEmail } from "@/lib/email";

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
});

describe("sendLpReportPublishedEmail — F47 escaping + WS54 note", () => {
  it("escapes HTML-special characters in reportTitle and lpName instead of breaking markup", async () => {
    await sendLpReportPublishedEmail({
      email: "lp@example.com",
      lpName: "<Bad> & \"Name\"",
      fundName: "FUND1",
      reportTitle: "Q1 & Q2 <SPV>",
    });

    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain("Q1 &amp; Q2 &lt;SPV&gt;");
    expect(html).not.toContain("Q1 & Q2 <SPV>");
    expect(html).toContain("Hi &lt;Bad&gt;"); // firstName is the first whitespace-delimited token
    expect(html).not.toContain("Hi <Bad>");
  });

  it("renders the optional note as its own paragraph, escaped, after the intro and before the button", async () => {
    await sendLpReportPublishedEmail({
      email: "lp@example.com",
      fundName: "FUND1",
      reportTitle: "H1 2026 Report",
      note: "Line one\nLine <two> & more",
    });

    const html = mockSend.mock.calls[0][0].html as string;
    const introIdx = html.indexOf("We've just published");
    const noteIdx = html.indexOf("Line one<br>Line &lt;two&gt; &amp; more");
    const buttonIdx = html.indexOf("Read the Report");

    expect(introIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(introIdx);
    expect(buttonIdx).toBeGreaterThan(noteIdx);
  });

  it("omits the note paragraph entirely and drops 'It's a short read.' when note is absent", async () => {
    await sendLpReportPublishedEmail({
      email: "lp@example.com",
      fundName: "FUND1",
      reportTitle: "H1 2026 Report",
    });

    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).not.toContain("It's a short read.");
    // Byte-identical-when-empty contract: the intro paragraph's closing tag is
    // immediately followed by the blank-line-then-button sequence, with no
    // note paragraph (and thus no note-only "<br>") spliced in between.
    expect(html).toContain(
      "plus a look at the portfolio companies behind the numbers.</p>\n\n      <p><a href="
    );
  });

  it("omits the note paragraph when note is blank/whitespace-only", async () => {
    await sendLpReportPublishedEmail({
      email: "lp@example.com",
      fundName: "FUND1",
      reportTitle: "H1 2026 Report",
      note: "   ",
    });

    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).not.toContain("It's a short read.");
  });
});
