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
      { lp: { email: "lp-a@example.com" } },
      { lp: { email: "lp-b@example.com" } },
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
      { lp: { email: "bounces@example.com" } },
      { lp: { email: "lp-good@example.com" } },
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
});
