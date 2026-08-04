import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 16, WS40 — GET/PATCH /api/companies/[id]/diligence: the founder
// checklist route. Mocked db/auth-guard, synthetic data only.
// Part 18, WS44 (F36, JC-DD-H/I) — completion-transition emails, mocked
// via @/lib/email.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendDiligenceCompletedFounderEmail: vi.fn(() => Promise.resolve()),
  sendDiligenceCompletedAdminNotification: vi.fn(() => Promise.resolve()),
}));

const mockCompanyFindUnique = vi.fn();
const mockDocumentFindFirst = vi.fn();
const mockDocumentFindMany = vi.fn();
const mockCompanyDiligenceFindUnique = vi.fn();
const mockCompanyDiligenceUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    company: { findUnique: (...args: unknown[]) => mockCompanyFindUnique(...args) },
    document: {
      findFirst: (...args: unknown[]) => mockDocumentFindFirst(...args),
      findMany: (...args: unknown[]) => mockDocumentFindMany(...args),
    },
    companyDiligence: {
      findUnique: (...args: unknown[]) => mockCompanyDiligenceFindUnique(...args),
      update: (...args: unknown[]) => mockCompanyDiligenceUpdate(...args),
    },
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import {
  sendDiligenceCompletedFounderEmail,
  sendDiligenceCompletedAdminNotification,
} from "@/lib/email";
import { GET, PATCH } from "@/app/api/companies/[id]/diligence/route";

const mockRequireCompanyAccess = vi.mocked(requireCompanyAccess);
const mockSendFounderEmail = vi.mocked(sendDiligenceCompletedFounderEmail);
const mockSendAdminEmail = vi.mocked(sendDiligenceCompletedAdminNotification);

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

const FOUNDER = { id: "founder-1", email: "founder@acme.com", name: "Founder Person", roles: ["FOUNDER"] };
const ADMIN = { id: "admin-1", email: "admin@dfs.vc", name: "Admin Person", roles: ["ADMIN"] };

beforeEach(() => {
  mockRequireCompanyAccess.mockReset();
  mockCompanyFindUnique.mockReset();
  mockDocumentFindFirst.mockReset();
  mockDocumentFindMany.mockReset();
  mockDocumentFindMany.mockResolvedValue([]); // no DD documents uploaded, by default
  mockCompanyDiligenceFindUnique.mockReset();
  mockCompanyDiligenceUpdate.mockReset();
  mockSendFounderEmail.mockReset();
  mockSendFounderEmail.mockResolvedValue(undefined as never);
  mockSendAdminEmail.mockReset();
  mockSendAdminEmail.mockResolvedValue(undefined as never);
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
    mockDocumentFindMany.mockResolvedValue([
      { docType: "passport", name: "passport.pdf", createdAt: new Date("2026-01-01") },
    ]);

    const res = await GET(getReq(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stage).toBe("DILIGENCE");
    expect(body.progress).toEqual({ done: 2, total: 2 });
    expect(mockCompanyDiligenceUpdate).not.toHaveBeenCalled();
    // Part 16, WS42 — name+date metadata only, sourced independently of
    // GET /api/companies/[id]/documents (which now filters isInternal
    // docs like this one out for non-admins).
    expect(body.documents.passport).toEqual({ name: "passport.pdf", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(body.documents.bank_statements).toBeNull();
  });

  it("persists completedAt the moment a GET observes the checklist has become complete", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      name: "Acme",
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

  // Part 18, WS44 (F36, JC-DD-H/I)
  it("a genuine completion via GET fires both completion emails exactly once", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      name: "Acme",
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

    await GET(getReq(), params());

    expect(mockSendFounderEmail).toHaveBeenCalledTimes(1);
    expect(mockSendFounderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "founder@acme.com", founderName: "Founder Person", companyName: "Acme" })
    );
    expect(mockSendAdminEmail).toHaveBeenCalledTimes(1);
    expect(mockSendAdminEmail).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: "Acme", founderName: "Founder Person", founderEmail: "founder@acme.com" })
    );
  });

  it("a same-state GET of an already-complete checklist does not re-fire the emails", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      name: "Acme",
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

    await GET(getReq(), params());

    expect(mockSendFounderEmail).not.toHaveBeenCalled();
    expect(mockSendAdminEmail).not.toHaveBeenCalled();
  });

  it("an admin session hitting GET never sends the founder confirmation (or admin notification) email, per JC-DD-I", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ user: ADMIN, error: null } as any);
    mockCompanyFindUnique.mockResolvedValue({
      name: "Acme",
      stage: "DILIGENCE",
      diligence: {
        isUsIncorporated: true,
        isStellarEcosystem: false,
        stellarWhyText: null,
        stellarTimelineText: null,
        completedAt: null,
      },
    });
    mockDocumentFindFirst.mockResolvedValue({ id: "passport-doc" });

    await GET(getReq(), params());

    expect(mockSendFounderEmail).not.toHaveBeenCalled();
    expect(mockSendAdminEmail).not.toHaveBeenCalled();
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
    mockCompanyDiligenceFindUnique.mockResolvedValue({ companyId: "company-1", company: { name: "Acme" } });
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
    mockCompanyDiligenceFindUnique.mockResolvedValue({ companyId: "company-1", company: { name: "Acme" } });
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

  // Part 18, WS44 (F36, JC-DD-H/I)
  it("a genuine completion via PATCH (the last required answer) fires both completion emails exactly once", async () => {
    mockCompanyDiligenceFindUnique.mockResolvedValue({
      companyId: "company-1",
      completedAt: null,
      company: { name: "Acme" },
    });
    mockCompanyDiligenceUpdate.mockResolvedValue({
      isUsIncorporated: true,
      isStellarEcosystem: false,
      stellarWhyText: null,
      stellarTimelineText: null,
      completedAt: null,
    });
    mockDocumentFindFirst.mockResolvedValue({ id: "passport-doc" }); // already uploaded

    await PATCH(patchReq({ isUsIncorporated: true }), params());

    expect(mockSendFounderEmail).toHaveBeenCalledTimes(1);
    expect(mockSendFounderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "founder@acme.com", founderName: "Founder Person", companyName: "Acme" })
    );
    expect(mockSendAdminEmail).toHaveBeenCalledTimes(1);
    expect(mockSendAdminEmail).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: "Acme", founderName: "Founder Person", founderEmail: "founder@acme.com" })
    );
  });

  it("a no-op PATCH on an already-complete checklist does not re-fire the emails", async () => {
    mockCompanyDiligenceFindUnique.mockResolvedValue({
      companyId: "company-1",
      completedAt: new Date("2026-01-01T00:00:00Z"),
      company: { name: "Acme" },
    });
    mockCompanyDiligenceUpdate.mockResolvedValue({
      isUsIncorporated: true,
      isStellarEcosystem: false,
      stellarWhyText: null,
      stellarTimelineText: null,
      completedAt: new Date("2026-01-01T00:00:00Z"),
    });
    mockDocumentFindFirst.mockResolvedValue({ id: "passport-doc" });

    await PATCH(patchReq({ isUsIncorporated: true }), params());

    expect(mockSendFounderEmail).not.toHaveBeenCalled();
    expect(mockSendAdminEmail).not.toHaveBeenCalled();
  });

  it("a legitimate re-completion (complete -> incomplete -> complete, e.g. re-uploading an archived passport) fires the emails again", async () => {
    // The checklist was previously complete but has since gone incomplete
    // (recomputeDiligenceCompletion already reset completedAt to null on
    // that earlier incomplete recompute) — this PATCH is the moment it
    // becomes complete again.
    mockCompanyDiligenceFindUnique.mockResolvedValue({
      companyId: "company-1",
      completedAt: null,
      company: { name: "Acme" },
    });
    mockCompanyDiligenceUpdate.mockResolvedValue({
      isUsIncorporated: true,
      isStellarEcosystem: false,
      stellarWhyText: null,
      stellarTimelineText: null,
      completedAt: null,
    });
    mockDocumentFindFirst.mockResolvedValue({ id: "new-passport-doc" }); // freshly re-uploaded

    await PATCH(patchReq({ isUsIncorporated: true }), params());

    expect(mockSendFounderEmail).toHaveBeenCalledTimes(1);
    expect(mockSendAdminEmail).toHaveBeenCalledTimes(1);
  });

  it("an admin session hitting PATCH never sends the founder confirmation (or admin notification) email, per JC-DD-I", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ user: ADMIN, error: null } as any);
    mockCompanyDiligenceFindUnique.mockResolvedValue({
      companyId: "company-1",
      completedAt: null,
      company: { name: "Acme" },
    });
    mockCompanyDiligenceUpdate.mockResolvedValue({
      isUsIncorporated: true,
      isStellarEcosystem: false,
      stellarWhyText: null,
      stellarTimelineText: null,
      completedAt: null,
    });
    mockDocumentFindFirst.mockResolvedValue({ id: "passport-doc" });

    await PATCH(patchReq({ isUsIncorporated: true }), params());

    expect(mockSendFounderEmail).not.toHaveBeenCalled();
    expect(mockSendAdminEmail).not.toHaveBeenCalled();
  });
});
