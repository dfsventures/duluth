import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 16, WS40 — GET/PATCH /api/companies/[id]/diligence: the founder
// checklist route. Mocked db/auth-guard, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));

const mockCompanyFindUnique = vi.fn();
const mockDocumentFindFirst = vi.fn();
const mockCompanyDiligenceFindUnique = vi.fn();
const mockCompanyDiligenceUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    company: { findUnique: (...args: unknown[]) => mockCompanyFindUnique(...args) },
    document: { findFirst: (...args: unknown[]) => mockDocumentFindFirst(...args) },
    companyDiligence: {
      findUnique: (...args: unknown[]) => mockCompanyDiligenceFindUnique(...args),
      update: (...args: unknown[]) => mockCompanyDiligenceUpdate(...args),
    },
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { GET, PATCH } from "@/app/api/companies/[id]/diligence/route";

const mockRequireCompanyAccess = vi.mocked(requireCompanyAccess);

function params(id = "company-1") {
  return { params: Promise.resolve({ id }) };
}

function getReq() {
  return new Request("https://molly.dfslab.net/api/companies/company-1/diligence");
}

function patchReq(body: unknown) {
  return new Request("https://molly.dfslab.net/api/companies/company-1/diligence", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FOUNDER = { id: "founder-1", email: "founder@acme.com", roles: ["FOUNDER"] };

beforeEach(() => {
  mockRequireCompanyAccess.mockReset();
  mockCompanyFindUnique.mockReset();
  mockDocumentFindFirst.mockReset();
  mockCompanyDiligenceFindUnique.mockReset();
  mockCompanyDiligenceUpdate.mockReset();
  mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);
});

describe("GET /api/companies/[id]/diligence", () => {
  it("404s when the company has no diligence row", async () => {
    mockCompanyFindUnique.mockResolvedValue({ stage: "ACTIVE", diligence: null });
    const res = await GET(getReq(), params());
    expect(res.status).toBe(404);
  });

  it("returns the diligence row, stage, and progress; leaves completedAt untouched when already complete", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      stage: "DILIGENCE",
      diligence: {
        isUsIncorporated: true,
        isStellarEcosystem: false,
        stellarWhyText: null,
        stellarTimelineText: null,
        completedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    mockDocumentFindFirst.mockResolvedValue({ id: "passport-doc" });

    const res = await GET(getReq(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stage).toBe("DILIGENCE");
    expect(body.progress).toEqual({ done: 2, total: 2 });
    expect(mockCompanyDiligenceUpdate).not.toHaveBeenCalled();
  });

  it("persists completedAt the moment a GET observes the checklist has become complete", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      stage: "DILIGENCE",
      diligence: {
        isUsIncorporated: true,
        isStellarEcosystem: false,
        stellarWhyText: null,
        stellarTimelineText: null,
        completedAt: null,
      },
    });
    mockDocumentFindFirst.mockResolvedValue({ id: "passport-doc" }); // uploaded since last read

    const res = await GET(getReq(), params());
    const body = await res.json();

    expect(body.completedAt).not.toBeNull();
    expect(mockCompanyDiligenceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "company-1" } })
    );
  });
});

describe("PATCH /api/companies/[id]/diligence", () => {
  it("404s when there's no diligence row for this company", async () => {
    mockCompanyDiligenceFindUnique.mockResolvedValue(null);
    const res = await PATCH(patchReq({ isUsIncorporated: true }), params());
    expect(res.status).toBe(404);
  });

  it("rejects a body with no valid fields", async () => {
    mockCompanyDiligenceFindUnique.mockResolvedValue({ companyId: "company-1" });
    const res = await PATCH(patchReq({ completedAt: "2026-01-01", closedAt: "2026-01-01" }), params());
    expect(res.status).toBe(400);
  });

  it("never lets the client set completedAt, closedAt, or isStellarEcosystem directly", async () => {
    mockCompanyDiligenceFindUnique.mockResolvedValue({ companyId: "company-1" });
    mockCompanyDiligenceUpdate.mockResolvedValue({
      isUsIncorporated: true,
      isStellarEcosystem: false,
      stellarWhyText: null,
      stellarTimelineText: null,
      completedAt: null,
    });
    mockDocumentFindFirst.mockResolvedValue(null);

    await PATCH(
      patchReq({
        isUsIncorporated: true,
        completedAt: "2099-01-01",
        closedAt: "2099-01-01",
        isStellarEcosystem: true,
      }),
      params()
    );

    expect(mockCompanyDiligenceUpdate).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      data: { isUsIncorporated: true },
    });
  });

  it("persists the Stellar essay fields", async () => {
    mockCompanyDiligenceFindUnique.mockResolvedValue({ companyId: "company-1" });
    mockCompanyDiligenceUpdate.mockResolvedValue({
      isUsIncorporated: true,
      isStellarEcosystem: true,
      stellarWhyText: "Because X",
      stellarTimelineText: "Q1 2027",
      completedAt: null,
    });
    mockDocumentFindFirst.mockResolvedValue({ id: "passport-doc" });

    const res = await PATCH(
      patchReq({ stellarWhyText: "Because X", stellarTimelineText: "Q1 2027" }),
      params()
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockCompanyDiligenceUpdate).toHaveBeenNthCalledWith(1, {
      where: { companyId: "company-1" },
      data: { stellarWhyText: "Because X", stellarTimelineText: "Q1 2027" },
    });
    expect(body.progress).toEqual({ done: 4, total: 4 });
  });
});
