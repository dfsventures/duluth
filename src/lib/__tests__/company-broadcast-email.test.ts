import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 30, WS72 — sendCompanyBroadcastEmail / sendCompanyBroadcastEmails.
// Mirrors lp-report-published-email.test.ts: mock only the resend SDK and
// exercise the real functions. The mock class needs a `batch` member
// alongside `emails` for the fan-out helper.

const mockSend = vi.fn();
const mockBatchSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => mockSend(...args) };
    batch = { send: (...args: unknown[]) => mockBatchSend(...args) };
  },
}));

import { sendCompanyBroadcastEmail, sendCompanyBroadcastEmails } from "@/lib/email";

beforeEach(() => {
  mockSend.mockReset();
  mockBatchSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
  mockBatchSend.mockResolvedValue({ data: { data: [{ id: "email-1" }], errors: [] }, error: null });
});

describe("sendCompanyBroadcastEmail", () => {
  it("includes the body markup verbatim, unescaped", async () => {
    await sendCompanyBroadcastEmail({
      email: "founder@example.com",
      subject: "Hello portfolio",
      bodyHtml: "<p>Big news — <strong>we raised</strong> a fund.</p><ul><li>One</li></ul>",
    });
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain("<strong>we raised</strong>");
    expect(html).toContain("<ul><li>One</li></ul>");
  });

  it("escapes plain-text fields (recipientName) — the F47 contract", async () => {
    await sendCompanyBroadcastEmail({
      email: "founder@example.com",
      recipientName: '<Bad> & "Name"',
      subject: "Hello",
      bodyHtml: "<p>hi</p>",
    });
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain("Hi &lt;Bad&gt;");
    expect(html).not.toContain("Hi <Bad>");
  });

  it("never puts a company name in the output — the template accepts no company field at all (JC-BC-G)", async () => {
    await sendCompanyBroadcastEmail({
      email: "founder@example.com",
      recipientName: "Jane",
      subject: "Update",
      bodyHtml: "<p>Some news for everyone.</p>",
    });
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).not.toContain("Acme");
    expect(html).not.toContain("Northwind");
  });

  it("sends from the module FROM constant with replyTo TEAM_EMAIL", async () => {
    await sendCompanyBroadcastEmail({ email: "founder@example.com", subject: "Hi", bodyHtml: "<p>hi</p>" });
    const call = mockSend.mock.calls[0][0];
    expect(call.from).toBeTruthy();
    expect(call.replyTo).toBeTruthy();
  });

  it("falls back to 'Hello,' when recipientName is missing", async () => {
    await sendCompanyBroadcastEmail({ email: "founder@example.com", subject: "Hi", bodyHtml: "<p>hi</p>" });
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain("Hello,");
  });
});

describe("sendCompanyBroadcastEmails (fan-out)", () => {
  it("issues exactly two batch.send calls (100 + 50) for 150 messages", async () => {
    const messages = Array.from({ length: 150 }, (_, i) => ({
      email: `p${i}@example.com`,
      subject: "Update",
      bodyHtml: "<p>hi</p>",
    }));
    await sendCompanyBroadcastEmails(messages);
    expect(mockBatchSend).toHaveBeenCalledTimes(2);
    expect(mockBatchSend.mock.calls[0][0]).toHaveLength(100);
    expect(mockBatchSend.mock.calls[1][0]).toHaveLength(50);
  });

  it("marks exactly the permissive-errors index failed and the rest ok, in input order", async () => {
    mockBatchSend.mockResolvedValueOnce({
      data: { data: [{ id: "e1" }, { id: "e2" }, { id: "e3" }], errors: [{ index: 1, message: "invalid" }] },
      error: null,
    });
    const messages = [
      { email: "a@example.com", subject: "Hi", bodyHtml: "<p>hi</p>" },
      { email: "b@example.com", subject: "Hi", bodyHtml: "<p>hi</p>" },
      { email: "c@example.com", subject: "Hi", bodyHtml: "<p>hi</p>" },
    ];
    const result = await sendCompanyBroadcastEmails(messages);
    expect(result).toEqual([
      { email: "a@example.com", ok: true },
      { email: "b@example.com", ok: false, error: "invalid" },
      { email: "c@example.com", ok: true },
    ]);
  });

  it("marks every message in a thrown/errored chunk as failed and still returns results for other chunks", async () => {
    mockBatchSend
      .mockResolvedValueOnce({ data: null, error: "quota exceeded" })
      .mockResolvedValueOnce({ data: { data: [{ id: "e1" }], errors: [] }, error: null });

    const messages = Array.from({ length: 150 }, (_, i) => ({
      email: `p${i}@example.com`,
      subject: "Update",
      bodyHtml: "<p>hi</p>",
    }));
    const result = await sendCompanyBroadcastEmails(messages);
    expect(result).toHaveLength(150);
    expect(result.slice(0, 100).every((r) => r.ok === false)).toBe(true);
    expect(result.slice(100).every((r) => r.ok === true)).toBe(true);
  });

  it("marks a chunk failed when batch.send throws, without letting the throw escape", async () => {
    mockBatchSend.mockRejectedValueOnce(new Error("network error"));
    const messages = [{ email: "a@example.com", subject: "Hi", bodyHtml: "<p>hi</p>" }];
    const result = await sendCompanyBroadcastEmails(messages);
    expect(result).toEqual([{ email: "a@example.com", ok: false, error: expect.stringContaining("network error") }]);
  });
});
