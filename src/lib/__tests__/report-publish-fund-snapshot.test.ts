import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 14, WS35.1 — the fund-performance snapshot freeze on publish, a
// second, independent delete-and-recreate living alongside the existing
// mention freeze (same Q44-A semantics: re-freeze on every publish).
// Exercises the real POST /api/admin/reports/[id]/publish handler with a
// mocked db, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendLpReportPublishedEmail: vi.fn() }));

const mockFundReportFindUnique = vi.fn();
const mockPortfolioCompanyFindMany = vi.fn();
const mockFundReportMentionDeleteMany = vi.fn();
const mockFundReportMentionCreate = vi.fn();
const mockFundReportUpdate = vi.fn();
const mockLpFundMembershipFindMany = vi.fn();
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

const NO_MARKER_BODY = "<p>Dear limited partners, a great quarter.</p>";
const MARKER_BODY =
  '<p>Intro.</p><div data-fund-snapshot="true" data-fund-id="fund-1" data-fund-name="FUND1" class="fund-snapshot-block">Fund performance snapshot — FUND1 (updates when published)</div>';

function report(body: string) {
  return {
    id: "report-1",
    fundId: "fund-1",
    title: "FUND1 — H1 2026 Report",
    body,
    status: "DRAFT",
    fund: { name: "FUND1" },
  };
}

const fundFixture = {
  id: "fund-1",
  name: "FUND1",
  deals: [
    {
      amountUsd: 10000 as unknown as number,
      entryValuation: 1_000_000 as unknown as number,
      currentValuation: 2_000_000 as unknown as number,
      ownershipPct: null,
      dealDate: new Date("2023-01-01"),
      valuationAsOf: new Date("2025-01-01"),
      investmentType: "INITIAL",
      instrument: "SAFE",
      portfolioCompany: { name: "Acme Co" },
    },
  ],
  cashflows: [],
};

beforeEach(() => {
  mockRequireAdmin.mockReset();
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
  mockPortfolioCompanyFindMany.mockResolvedValue([]);
  mockFundReportUpdate.mockResolvedValue({ status: "PUBLISHED", publishedAt: new Date() });
  mockTxFundFindUnique.mockResolvedValue(fundFixture);
});

describe("POST /api/admin/reports/[id]/publish — fund-performance snapshot (Q44-A)", () => {
  it("publishing a report WITHOUT the marker creates no snapshot row (deleteMany still runs, no-op)", async () => {
    mockFundReportFindUnique.mockResolvedValue(report(NO_MARKER_BODY));

    const res = await POST(req(), { params: Promise.resolve({ id: "report-1" }) });

    expect(res.status).toBe(200);
    expect(mockFundReportFundSnapshotDeleteMany).toHaveBeenCalledWith({ where: { reportId: "report-1" } });
    expect(mockTxFundFindUnique).not.toHaveBeenCalled();
    expect(mockFundReportFundSnapshotCreate).not.toHaveBeenCalled();
  });

  it("publishing a report WITH the marker deletes-then-creates the snapshot, always keyed off report.fundId", async () => {
    mockFundReportFindUnique.mockResolvedValue(report(MARKER_BODY));

    const res = await POST(req(), { params: Promise.resolve({ id: "report-1" }) });

    expect(res.status).toBe(200);
    expect(mockFundReportFundSnapshotDeleteMany).toHaveBeenCalledWith({ where: { reportId: "report-1" } });
    // Ground rule 1: the fund lookup is always report.fundId, never anything
    // read from the request body.
    expect(mockTxFundFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fund-1" } })
    );
    expect(mockFundReportFundSnapshotCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockFundReportFundSnapshotCreate.mock.calls[0][0];
    expect(createArgs.data.reportId).toBe("report-1");
    expect(createArgs.data.fundId).toBe("fund-1");
    expect(createArgs.data.fundName).toBe("FUND1");
    expect(createArgs.data.snapshot.fundName).toBe("FUND1");
    expect(createArgs.data.snapshot.deals).toHaveLength(1);
    expect(createArgs.data.snapshot.deals[0].companyName).toBe("Acme Co");
    // Q42 structural guard, exercised at the route level too.
    expect(createArgs.data.snapshot.deals[0]).not.toHaveProperty("sheetRowId");
  });

  it("a request-body fundId can never redirect which fund gets frozen (ground rule 1)", async () => {
    mockFundReportFindUnique.mockResolvedValue(report(MARKER_BODY));

    await POST(req({ notify: false, fundId: "some-other-fund" }), { params: Promise.resolve({ id: "report-1" }) });

    expect(mockTxFundFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "fund-1" } }));
    const createArgs = mockFundReportFundSnapshotCreate.mock.calls[0][0];
    expect(createArgs.data.fundId).toBe("fund-1");
  });
});
