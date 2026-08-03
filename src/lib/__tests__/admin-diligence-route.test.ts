import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 16, WS41 — GET /api/admin/diligence (the review queue) and
// POST /api/admin/diligence/[id]/promote. Mocked db/auth/audit,
// synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockCompanyFindMany = vi.fn();
const mockCompanyFindUnique = vi.fn();
const mockDocumentFindMany = vi.fn();
const mockCompanyDiligenceUpdate = vi.fn();
const mockCompanyUpdate = vi.fn();
const mockTransaction = vi.fn((ops: unknown[]) => Promise.all(ops));

vi.mock("@/lib/db", () => ({
  db: {
    company: {
      findMany: (...args: unknown[]) => mockCompanyFindMany(...args),
      findUnique: (...args: unknown[]) => mockCompanyFindUnique(...args),
      update: (...args: unknown[]) => mockCompanyUpdate(...args),
    },
    document: { findMany: (...args: unknown[]) => mockDocumentFindMany(...args) },
    companyDiligence: { update: (...args: unknown[]) => mockCompanyDiligenceUpdate(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...(args as [unknown[]])),
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { GET } from "@/app/api/admin/diligence/route";
import { POST } from "@/app/api/admin/diligence/[id]/promote/route";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockLogAdminAction = vi.mocked(logAdminAction);

const ADMIN = { id: "admin-1", email: "admin@dfs.vc", roles: ["ADMIN"] };

function params(id = "company-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockCompanyFindMany.mockReset();
  mockCompanyFindUnique.mockReset();
  mockDocumentFindMany.mockReset();
  mockCompanyDiligenceUpdate.mockReset();
  mockCompanyUpdate.mockReset();
  mockTransaction.mockClear();
  mockLogAdminAction.mockReset();
  mockRequireAdmin.mockResolvedValue({ user: ADMIN, error: null } as any);
});

describe("GET /api/admin/diligence", () => {
  it("splits companies into awaiting-founder vs ready-for-review via completedAt", async () => {
    mockCompanyFindMany.mockResolvedValue([
      {
        id: "company-awaiting",
        name: "Acme",
        createdAt: new Date("2026-01-01"),
        diligence: {
          isUsIncorporated: null,
          isStellarEcosystem: false,
          stellarWhyText: null,
          stellarTimelineText: null,
          completedAt: null,
        },
        memberships: [{ user: { name: "Founder A", email: "a@acme.com" } }],
      },
      {
        id: "company-ready",
        name: "Beta",
        createdAt: new Date("2026-01-02"),
        diligence: {
          isUsIncorporated: true,
          isStellarEcosystem: false,
          stellarWhyText: null,
          stellarTimelineText: null,
          completedAt: new Date("2026-01-05"),
        },
        memberships: [{ user: { name: "Founder B", email: "b@beta.com" } }],
      },
    ]);
    mockDocumentFindMany.mockResolvedValue([
      { companyId: "company-ready", docType: "passport" },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);

    const awaiting = body.find((c: any) => c.id === "company-awaiting");
    const ready = body.find((c: any) => c.id === "company-ready");
    expect(awaiting.diligence.completedAt).toBeNull();
    expect(ready.diligence.completedAt).not.toBeNull();
    expect(ready.documentCounts.passport).toBe(1);
    expect(awaiting.documentCounts.passport).toBe(0);
  });

  it("requires admin", async () => {
    const forbidden = { user: null, error: { status: 403 } } as any;
    mockRequireAdmin.mockResolvedValue(forbidden);
    const res = await GET();
    expect(res).toBe(forbidden.error);
  });
});

describe("POST /api/admin/diligence/[id]/promote", () => {
  it("404s when the company is not in DILIGENCE stage", async () => {
    mockCompanyFindUnique.mockResolvedValue({ id: "company-1", stage: "ACTIVE", diligence: {}, memberships: [] });
    const res = await POST(new Request("https://molly.dfslab.net"), params());
    expect(res.status).toBe(404);
    expect(mockCompanyUpdate).not.toHaveBeenCalled();
  });

  it("sets stage ACTIVE + closedAt, and audit-logs COMPANY_DILIGENCE_PROMOTED — never touching Fund/Deal/PortfolioCompany", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      id: "company-1",
      name: "Acme",
      stage: "DILIGENCE",
      diligence: { companyId: "company-1" },
      memberships: [{ user: { email: "founder@acme.com" } }],
    });
    mockCompanyUpdate.mockResolvedValue({});
    mockCompanyDiligenceUpdate.mockResolvedValue({});

    const res = await POST(new Request("https://molly.dfslab.net"), params());

    expect(res.status).toBe(200);
    expect(mockCompanyUpdate).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { stage: "ACTIVE" },
    });
    expect(mockCompanyDiligenceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "company-1" }, data: expect.objectContaining({ closedAt: expect.any(Date) }) })
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      ADMIN,
      "COMPANY_DILIGENCE_PROMOTED",
      expect.objectContaining({
        targetType: "Company",
        targetId: "company-1",
        metadata: { companyName: "Acme", founderEmail: "founder@acme.com" },
      })
    );
  });
});
