import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 7, WS19 (Q7 = B): opt-in "Notify this fund's LPs by email" on publish.
// This exercises the actual POST /api/admin/reports/[id]/publish handler
// with a mocked db/email, synthetic data only — pinning the F12 lesson
// (one bad address never blocks the others or the publish itself).

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockSendLpReportPublishedEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendLpReportPublishedEmail: (...args: unknown[]) => mockSendLpReportPublishedEmail(...args),
}));

const mockFundReportFindUnique = vi.fn();
const mockPortfolioCompanyFindMany = vi.fn();
const mockFundReportMentionDeleteMany = vi.fn();
const mockFundReportMentionCreate = vi.fn();
const mockFundReportUpdate = vi.fn();
const mockLpFundMembershipFindMany = vi.fn();
// Part 14, WS35.1 — the fund-performance snapshot freeze, a second
// delete-and-recreate alongside the mention freeze above.
const mockFundReportFundSnapshotDeleteMany = vi.fn();
const mockFundReportFundSnapshotCreate = vi.fn();
const mockTxFundFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    fundReport: {
      findUnique: (...args: unknown[]) => mockFundReportFindUnique(...args),
      update: (...args: unknown[]) => mockFundReportUpdate(...args),
    },
    portfolioCompany: { findMany: (...args: unknown[]) => mockPortfolioCompanyFindMany(...args) },
    fundReportMention: {
      deleteMany: (...args: unknown[]) => mockFundReportMentionDeleteMany(...args),
      create: (...args: unknown[]) => mockFundReportMentionCreate(...args),
    },
    lpFundMembership: { findMany: (...args: unknown[]) => mockLpFundMembershipFindMany(...args) },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        fundReportMention: {
          deleteMany: (...args: unknown[]) => mockFundReportMentionDeleteMany(...args),
          create: (...args: unknown[]) => mockFundReportMentionCreate(...args),
        },
        fundReportFundSnapshot: {
          deleteMany: (...args: unknown[]) => mockFundReportFundSnapshotDeleteMany(...args),
          create: (...args: unknown[]) => mockFundReportFundSnapshotCreate(...args),
        },
        fund: { findUnique: (...args: unknown[]) => mockTxFundFindUnique(...args) },
        fundReport: { update: (...args: unknown[]) => mockFundReportUpdate(...args) },
      }),
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { POST } from "@/app/api/admin/reports/[id]/publish/route";

const mockRequireAdmin = vi.mocked(requireAdmin);

function req(body?: unknown) {
  return new Request("https://molly.dfslab.net/api/admin/reports/report-1/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const draftReport = {
  id: "report-1",
  fundId: "fund-1",
  title: "FUND1 — H1 2026 Report",
  body: "<p>No mentions here.</p>",
  status: "DRAFT",
  fund: { name: "FUND1" },
};

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockSendLpReportPublishedEmail.mockReset();
  mockFundReportFindUnique.mockReset();
  mockPortfolioCompanyFindMany.mockReset();
  mockFundReportMentionDeleteMany.mockReset();
  mockFundReportMentionCreate.mockReset();
  mockFundReportUpdate.mockReset();
  mockLpFundMembershipFindMany.mockReset();
  mockFundReportFundSnapshotDeleteMany.mockReset();
  mockFundReportFundSnapshotCreate.mockReset();
  mockTxFundFindUnique.mockReset();

  mockRequireAdmin.mockResolvedValue({ user: { id: "admin-1", email: "admin@dfs.vc" }, error: null } as any);
  mockFundReportFindUnique.mockResolvedValue(draftReport);
  mockPortfolioCompanyFindMany.mockResolvedValue([]);
  mockFundReportUpdate.mockResolvedValue({ ...draftReport, status: "PUBLISHED", publishedAt: new Date() });
});

describe("POST /api/admin/reports/[id]/publish — notify (Q7 = B)", () => {
  it("does not notify anyone or call the LP lookup when notify is omitted", async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: "report-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockLpFundMembershipFindMany).not.toHaveBeenCalled();
    expect(mockSendLpReportPublishedEmail).not.toHaveBeenCalled();
    expect(data.notifyResult).toBeUndefined();
  });

  it("emails every LP of the fund once when notify is true", async () => {
    mockLpFundMembershipFindMany.mockResolvedValue([
      { lp: { name: "LP A", emails: [{ email: "lp-a@example.com" }] } },
      { lp: { name: "LP B", emails: [{ email: "lp-b@example.com" }] } },
    ]);
    mockSendLpReportPublishedEmail.mockResolvedValue(undefined);

    const res = await POST(req({ notify: true }), { params: Promise.resolve({ id: "report-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockSendLpReportPublishedEmail).toHaveBeenCalledTimes(2);
    expect(data.notifyResult).toEqual({ notified: 2, failed: 0 });
  });

  it("a failed send for one LP doesn't block the others or the publish itself (F12 lesson)", async () => {
    mockLpFundMembershipFindMany.mockResolvedValue([
      { lp: { name: "Bounces", emails: [{ email: "bounces@example.com" }] } },
      { lp: { name: "Good LP", emails: [{ email: "lp-good@example.com" }] } },
    ]);
    mockSendLpReportPublishedEmail
      .mockRejectedValueOnce(new Error("bounced"))
      .mockResolvedValueOnce(undefined);

    const res = await POST(req({ notify: true }), { params: Promise.resolve({ id: "report-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockFundReportUpdate).toHaveBeenCalled();
    expect(data.notifyResult).toEqual({ notified: 1, failed: 1 });
  });

  // Part 26 (WS61, D2): every address of an LP gets the notification.
  it("emails an LP with TWO addresses at both, and counts addresses not LPs", async () => {
    mockLpFundMembershipFindMany.mockResolvedValue([
      { lp: { name: "Multi LP", emails: [{ email: "personal@example.com" }, { email: "work@example.com" }] } },
    ]);
    mockSendLpReportPublishedEmail.mockResolvedValue(undefined);

    const res = await POST(req({ notify: true }), { params: Promise.resolve({ id: "report-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockSendLpReportPublishedEmail).toHaveBeenCalledTimes(2);
    const sentTo = mockSendLpReportPublishedEmail.mock.calls.map((c) => c[0].email).sort();
    expect(sentTo).toEqual(["personal@example.com", "work@example.com"]);
    expect(data.notifyResult).toEqual({ notified: 2, failed: 0 });
  });

  // F51: single-fund scope + @@unique([lpId, fundId]) + globally-unique
  // LpEmail.email together guarantee no address is ever mailed twice within
  // one publish — asserted here across a multi-LP, multi-address fund.
  it("never mails the same address twice across a multi-LP, multi-address fund", async () => {
    mockLpFundMembershipFindMany.mockResolvedValue([
      { lp: { name: "LP A", emails: [{ email: "a1@example.com" }, { email: "a2@example.com" }] } },
      { lp: { name: "LP B", emails: [{ email: "b1@example.com" }] } },
    ]);
    mockSendLpReportPublishedEmail.mockResolvedValue(undefined);

    const res = await POST(req({ notify: true }), { params: Promise.resolve({ id: "report-1" }) });
    const data = await res.json();

    const sentTo = mockSendLpReportPublishedEmail.mock.calls.map((c) => c[0].email);
    expect(res.status).toBe(200);
    expect(sentTo).toHaveLength(3);
    expect(new Set(sentTo).size).toBe(3); // no duplicates
    expect(data.notifyResult).toEqual({ notified: 3, failed: 0 });
  });

  it("silently skips an LP with zero addresses — no throw, no send", async () => {
    mockLpFundMembershipFindMany.mockResolvedValue([
      { lp: { name: "No Address LP", emails: [] } },
      { lp: { name: "Good LP", emails: [{ email: "good@example.com" }] } },
    ]);
    mockSendLpReportPublishedEmail.mockResolvedValue(undefined);

    const res = await POST(req({ notify: true }), { params: Promise.resolve({ id: "report-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockSendLpReportPublishedEmail).toHaveBeenCalledTimes(1);
    expect(data.notifyResult).toEqual({ notified: 1, failed: 0 });
  });
});

// Part 24, WS54 — optional per-publish admin note forwarded to the email fn
// and captured in the REPORT_PUBLISHED audit metadata.
describe("POST /api/admin/reports/[id]/publish — optional note (WS54)", () => {
  it("forwards the note to sendLpReportPublishedEmail for every recipient when present", async () => {
    mockLpFundMembershipFindMany.mockResolvedValue([
      { lp: { name: "LP A", emails: [{ email: "lp-a@example.com" }] } },
      { lp: { name: "LP B", emails: [{ email: "lp-b@example.com" }] } },
    ]);
    mockSendLpReportPublishedEmail.mockResolvedValue(undefined);

    const res = await POST(req({ notify: true, note: "See you at the AGM." }), {
      params: Promise.resolve({ id: "report-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockSendLpReportPublishedEmail).toHaveBeenCalledTimes(2);
    for (const call of mockSendLpReportPublishedEmail.mock.calls) {
      expect(call[0].note).toBe("See you at the AGM.");
    }
  });

  it("forwards note: null when the note is absent or blank (byte-identical-when-empty contract)", async () => {
    mockLpFundMembershipFindMany.mockResolvedValue([{ lp: { name: "LP A", emails: [{ email: "lp-a@example.com" }] } }]);
    mockSendLpReportPublishedEmail.mockResolvedValue(undefined);

    const res = await POST(req({ notify: true }), { params: Promise.resolve({ id: "report-1" }) });
    expect(res.status).toBe(200);
    expect(mockSendLpReportPublishedEmail).toHaveBeenCalledWith(expect.objectContaining({ note: null }));

    mockSendLpReportPublishedEmail.mockClear();
    const res2 = await POST(req({ notify: true, note: "   " }), { params: Promise.resolve({ id: "report-1" }) });
    expect(res2.status).toBe(200);
    expect(mockSendLpReportPublishedEmail).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
  });

  it("rejects a note over 500 characters with 400 and never publishes or sends", async () => {
    const res = await POST(req({ notify: true, note: "x".repeat(501) }), {
      params: Promise.resolve({ id: "report-1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/500 characters/);
    expect(mockFundReportUpdate).not.toHaveBeenCalled();
    expect(mockSendLpReportPublishedEmail).not.toHaveBeenCalled();
  });

  it("records noteIncluded and the verbatim note on the REPORT_PUBLISHED audit row", async () => {
    mockLpFundMembershipFindMany.mockResolvedValue([{ lp: { name: "LP A", emails: [{ email: "lp-a@example.com" }] } }]);
    mockSendLpReportPublishedEmail.mockResolvedValue(undefined);
    const { logAdminAction } = await import("@/lib/audit");

    await POST(req({ notify: true, note: "See you at the AGM." }), { params: Promise.resolve({ id: "report-1" }) });

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      "REPORT_PUBLISHED",
      expect.objectContaining({
        metadata: expect.objectContaining({ noteIncluded: true, note: "See you at the AGM." }),
      })
    );
  });

  it("records noteIncluded: false and omits note when no note is given", async () => {
    const { logAdminAction } = await import("@/lib/audit");

    await POST(req({ notify: false }), { params: Promise.resolve({ id: "report-1" }) });

    const call = (logAdminAction as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[2].metadata.noteIncluded).toBe(false);
    expect(call?.[2].metadata).not.toHaveProperty("note");
  });
});
