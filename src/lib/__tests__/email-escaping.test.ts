import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 25, WS56 / F49 — plain-text user values interpolated into email HTML
// bodies are escaped in every send* function (WS54 only covered
// sendLpReportPublishedEmail). Mocks only the Resend SDK. Subjects stay raw;
// sendUpdatePublishedEmail's opts.body is trusted TipTap and stays raw.

const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => mockSend(...args) };
  },
}));

import {
  sendNewSignupNotification,
  sendUpdatePublishedEmail,
  sendUpdateReminderEmail,
  sendTeamInviteEmail,
  sendMemberAddedEmail,
  sendDiligenceInviteEmail,
  sendDiligenceCompletedFounderEmail,
  sendDiligenceCompletedAdminNotification,
  sendCommentNotificationEmail,
  sendWeeklyDigestEmail,
  sendDigestDraftReadyEmail,
} from "@/lib/email";

const NAME = 'Q1 & <SPV> "Special"';
const ESC = "Q1 &amp; &lt;SPV&gt; &quot;Special&quot;";
const EVIL = 'Acme <a href="https://evil.example">x</a>';

function sent() {
  return mockSend.mock.calls[0][0] as { subject: string; html: string };
}

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });
});

describe("WS56 email body escaping", () => {
  it("sendNewSignupNotification escapes an unauthenticated name (no live link), subject stays raw", async () => {
    await sendNewSignupNotification("a@b.com", EVIL);
    const { html, subject } = sent();
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain("Acme &lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt;");
    expect(subject).toBe(`New access request: ${EVIL}`);
  });

  it("sendTeamInviteEmail escapes inviterName and companyName; subject raw", async () => {
    await sendTeamInviteEmail({ toEmail: "x@y.com", inviterName: "<b>Bob</b>", companyName: NAME, token: "t" });
    const { html, subject } = sent();
    expect(html).toContain(`&lt;b&gt;Bob&lt;/b&gt; invited you to join <strong>${ESC}</strong>`);
    expect(html).not.toContain("<b>Bob</b>");
    expect(subject).toBe(`${NAME} invited you to join Molly`);
  });

  it("sendMemberAddedEmail escapes inviterName and companyName", async () => {
    await sendMemberAddedEmail({ toEmail: "x@y.com", inviterName: "<i>Al</i>", companyName: NAME, token: "t" });
    const { html } = sent();
    expect(html).toContain(`&lt;i&gt;Al&lt;/i&gt; added you to <strong>${ESC}</strong>`);
  });

  it("sendUpdateReminderEmail escapes companyName (both places) and founder first name", async () => {
    await sendUpdateReminderEmail({ toEmail: "x@y.com", founderName: "<u>Zed</u> Q", companyName: NAME, daysSinceLastUpdate: 5 });
    const { html } = sent();
    expect(html.split(ESC).length - 1).toBe(2);
    expect(html).not.toContain(NAME);
    expect(html).toContain("Hi &lt;u&gt;Zed&lt;/u&gt;");
  });

  it("sendDiligenceInviteEmail escapes companyName in both body places", async () => {
    await sendDiligenceInviteEmail({ toEmail: "x@y.com", companyName: NAME, token: "t", isStellarEcosystem: false });
    const { html, subject } = sent();
    expect(html.split(ESC).length - 1).toBe(2);
    expect(html).not.toContain(NAME);
    expect(subject).toBe(`${NAME} — next step: due diligence`);
  });

  it("sendDiligenceCompletedFounderEmail escapes founderName and companyName", async () => {
    await sendDiligenceCompletedFounderEmail({ toEmail: "x@y.com", founderName: "<i>Fo</i>", companyName: NAME });
    const { html } = sent();
    expect(html).toContain(ESC);
    expect(html).not.toContain(NAME);
    expect(html).toContain("Hi &lt;i&gt;Fo&lt;/i&gt;");
  });

  it("sendDiligenceCompletedAdminNotification escapes inline text and fieldRow values (once, not double)", async () => {
    await sendDiligenceCompletedAdminNotification({ companyName: NAME, founderName: "<b>F</b>", founderEmail: "f@x.com" });
    const { html } = sent();
    expect(html).not.toContain(NAME);
    expect(html).not.toContain("<b>F</b>");
    expect(html).toContain(`&lt;b&gt;F&lt;/b&gt; has finished ${ESC}'s diligence`);
    expect(html).not.toContain("&amp;amp;");
  });

  it("sendCommentNotificationEmail escapes commenter, title, period, company, snippet, recipient name", async () => {
    await sendCommentNotificationEmail({
      toEmail: "x@y.com",
      toName: "<s>Tess</s> T",
      commenterName: "<b>C</b>",
      companyName: NAME,
      updateTitle: "T & <U>",
      updatePeriod: "Q1 <2>",
      commentSnippet: "1 < 2 & 3",
      ctaLink: "https://molly.dfs.vc/x",
      ctaLabel: "View",
    });
    const { html, subject } = sent();
    expect(html).toContain("&lt;b&gt;C&lt;/b&gt;");
    expect(html).toContain("T &amp; &lt;U&gt;");
    expect(html).toContain("(Q1 &lt;2&gt;)");
    expect(html).toContain("1 &lt; 2 &amp; 3");
    expect(html).toContain("Hi &lt;s&gt;Tess&lt;/s&gt;");
    expect(html).not.toContain(NAME);
    expect(subject).toBe(`New comment on ${NAME}: T & <U>`);
  });

  it("sendUpdatePublishedEmail escapes plain-text fields but leaves trusted opts.body raw", async () => {
    await sendUpdatePublishedEmail({
      companyName: NAME,
      companyId: "c1",
      updateId: "u1",
      title: "T & <U>",
      period: "Q1 <2>",
      body: "<p>Rich <strong>body</strong></p>",
      metrics: [{ name: "ARR <$>", unit: "&k", value: 5 }],
    });
    const { html, subject } = sent();
    expect(html).toContain("<p>Rich <strong>body</strong></p>");
    expect(html).toContain(ESC);
    expect(html).toContain("T &amp; &lt;U&gt; &middot; Q1 &lt;2&gt;");
    expect(html).toContain("ARR &lt;$&gt;");
    expect(html).toContain("&amp;k");
    expect(subject).toBe(`[${NAME}] T & <U> — Q1 <2>`);
  });
  it("Part 37 WS104: sendWeeklyDigestEmail escapes todos, assignee and title; section HTML is allowlisted, subject raw", async () => {
    await sendWeeklyDigestEmail({
      toEmail: "x@y.com",
      title: EVIL,
      sections: [
        { id: "s1", heading: "Wins", content: `<p>${EVIL}</p><p onclick="x()">ok</p><script>alert(1)</script>` },
      ],
      todos: [{ text: EVIL, completed: false, assigneeName: NAME }],
    });
    const { html, subject } = sent();
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<p onclick");
    expect(html).toContain("<p>Acme &lt;a href=");
    expect(html).toContain("Acme &lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt;");
    expect(html).toContain(ESC);
    expect(subject).toBe(EVIL);
  });
  it("Part 37 WS108: sendWeeklyDigestEmail escapes the per-todo projectLabel", async () => {
    await sendWeeklyDigestEmail({
      toEmail: "x@y.com",
      title: "T",
      sections: [],
      todos: [{ text: "t", completed: false, assigneeName: null, projectLabel: EVIL }],
    });
    const { html } = sent();
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain("Acme &lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt;");
  });

  it("Part 37 WS111: sendDigestDraftReadyEmail escapes meetingTitle and digestUrl; subject raw", async () => {
    await sendDigestDraftReadyEmail({
      toEmail: "x@y.com",
      meetingTitle: EVIL,
      needsReviewCount: 2,
      digestUrl: 'https://molly.test/admin/digest/1?a="><script>',
    });
    const { html, subject } = sent();
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain("Acme &lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt;");
    expect(html).not.toContain('"><script>');
    expect(html).toContain("2 items need your review");
    expect(subject).toBe(`Draft digest ready: ${EVIL}`);
  });
});
