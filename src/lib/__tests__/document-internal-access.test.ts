import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 16, WS42 (F33, Q59) — isInternal was previously a display badge
// only, not access control: any member of the company (any role) could
// list/download internal-only documents via these two routes. Fixed
// narrowly, scoped exactly to GET /api/companies/[id]/documents and
// GET /api/documents/[id] — a role check (admin vs. non-admin), not an
// uploader exception. PATCH (archive/docType edit) is untouched.
// Mocked db/auth-guard, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/s3", () => ({ getDownloadUrl: vi.fn(() => Promise.resolve("https://s3.example.com/signed")) }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockDocumentFindMany = vi.fn();
const mockDocumentFindUnique = vi.fn();
const mockDocumentUpdate = vi.fn();
const mockUpdateFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    document: {
      findMany: (...args: unknown[]) => mockDocumentFindMany(...args),
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args),
      update: (...args: unknown[]) => mockDocumentUpdate(...args),
    },
    update: {
      findUnique: (...args: unknown[]) => mockUpdateFindUnique(...args),
    },
  },
}));

import { requireCompanyAccess, requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { GET as getCompanyDocuments } from "@/app/api/companies/[id]/documents/route";
import { GET as getDocument, PATCH as patchDocument } from "@/app/api/documents/[id]/route";
import { GET as getDocumentView } from "@/app/api/documents/[id]/view/route";
import { GET as getUpdate } from "@/app/api/updates/[id]/route";

const mockRequireCompanyAccess = vi.mocked(requireCompanyAccess);
const mockRequireAdmin = vi.mocked(requireAdmin);
const mockLogAdminAction = vi.mocked(logAdminAction);

const FOUNDER = { id: "founder-1", email: "founder@acme.com", roles: ["FOUNDER"] };
const UPLOADER = { id: "uploader-1", email: "uploader@acme.com", roles: ["FOUNDER"] };
const ADMIN = { id: "admin-1", email: "admin@dfs.vc", roles: ["ADMIN"] };

function params(id = "company-1") {
  return { params: Promise.resolve({ id }) };
}

function listReq() {
  return new Request("https://molly.dfslab.net/api/companies/company-1/documents");
}

function docReq() {
  return new Request("https://molly.dfslab.net/api/documents/doc-1");
}

function patchReq(body: Record<string, unknown>) {
  return new Request("https://molly.dfslab.net/api/documents/doc-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockRequireCompanyAccess.mockReset();
  mockRequireAdmin.mockReset();
  mockDocumentFindMany.mockReset();
  mockDocumentFindUnique.mockReset();
  mockDocumentUpdate.mockReset();
  mockUpdateFindUnique.mockReset();
  mockLogAdminAction.mockReset();
});

describe("GET /api/companies/[id]/documents — isInternal filtering", () => {
  it("a founder's query excludes other members' isInternal docs, but allows their own (non-admin)", async () => {
    // Fixed live 2026-08-04: a founder's own isInternal upload (e.g. a
    // DD passport/bank-statement) was invisible even to the uploader,
    // since the original filter was a blanket `isInternal: false` with
    // no uploader exception. Now `isInternal: false OR uploadedById: me`
    // — still never returns a TEAMMATE's internal doc to a non-admin.
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);
    mockDocumentFindMany.mockResolvedValue([]);

    await getCompanyDocuments(listReq(), params());

    expect(mockDocumentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ isInternal: false }, { uploadedById: FOUNDER.id }],
        }),
      })
    );
  });

  it("an admin's query has no isInternal filter — every row still returned", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ user: ADMIN, error: null } as any);
    mockDocumentFindMany.mockResolvedValue([]);

    await getCompanyDocuments(listReq(), params());

    const whereArg = mockDocumentFindMany.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("isInternal");
  });
});

describe("GET /api/documents/[id] — isInternal enforcement", () => {
  it("403s a non-admin reading an isInternal document", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-1",
      companyId: "company-1",
      s3Key: "key",
      isInternal: true,
    });
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);

    const res = await getDocument(docReq(), params("doc-1"));
    expect(res.status).toBe(403);
  });

  it("still 403s the document's own uploader once it's flagged internal — a role check, not an uploader exception", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-1",
      companyId: "company-1",
      uploadedById: UPLOADER.id,
      s3Key: "key",
      isInternal: true,
    });
    mockRequireCompanyAccess.mockResolvedValue({ user: UPLOADER, error: null } as any);

    const res = await getDocument(docReq(), params("doc-1"));
    expect(res.status).toBe(403);
  });

  it("200s an admin reading the same isInternal document, unchanged, with a downloadUrl", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-1",
      companyId: "company-1",
      s3Key: "key",
      isInternal: true,
    });
    mockRequireCompanyAccess.mockResolvedValue({ user: ADMIN, error: null } as any);

    const res = await getDocument(docReq(), params("doc-1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.downloadUrl).toBe("https://s3.example.com/signed");
  });

  it("200s a non-admin reading a non-internal document, unchanged (no regression to the June IDOR fix's baseline behavior)", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-1",
      companyId: "company-1",
      s3Key: "key",
      isInternal: false,
    });
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);

    const res = await getDocument(docReq(), params("doc-1"));
    expect(res.status).toBe(200);
  });

  it("still 404s a missing document before the isInternal check runs", async () => {
    mockDocumentFindUnique.mockResolvedValue(null);
    const res = await getDocument(docReq(), params("doc-1"));
    expect(res.status).toBe(404);
    expect(mockRequireCompanyAccess).not.toHaveBeenCalled();
  });

  it("still enforces requireCompanyAccess first — a non-member gets that route's error, not a 403 from the isInternal check", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-1",
      companyId: "company-1",
      s3Key: "key",
      isInternal: false,
    });
    const forbidden = { user: null, error: { status: 403, __marker: "requireCompanyAccess" } } as any;
    mockRequireCompanyAccess.mockResolvedValue(forbidden);

    const res = await getDocument(docReq(), params("doc-1"));
    expect(res).toBe(forbidden.error);
  });
});

// Part 20, WS46 (F39) — PATCH previously ran requireCompanyAccess only,
// meaning any founder member of the company (any role, any relationship
// to the document) could archive/unarchive/retype ANY document via a
// direct API call — no UI needed, the admin UI was just the only front
// door that happened to call it. Per Q65 = A, the founder documents page
// (WS47) never renders an archive/retype control, so this route is now
// admin-only, full stop.
describe("PATCH /api/documents/[id] — F39: admin-only, closed at the endpoint", () => {
  it("rejects a non-admin (founder) attempting to archive their own upload, with no admin gate ever reached", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      companyId: "company-1",
      archivedAt: null,
    });
    mockRequireAdmin.mockResolvedValue({
      user: null,
      error: { status: 403, __marker: "requireAdmin" },
    } as any);

    const res = await patchDocument(patchReq({ archive: true }), params("doc-1"));
    expect(res.status).toBe(403);
    expect(mockDocumentUpdate).not.toHaveBeenCalled();
  });

  it("rejects a non-admin attempting to retype (docType) their own upload", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      companyId: "company-1",
      archivedAt: null,
    });
    mockRequireAdmin.mockResolvedValue({
      user: null,
      error: { status: 403, __marker: "requireAdmin" },
    } as any);

    const res = await patchDocument(patchReq({ docType: "financials" }), params("doc-1"));
    expect(res.status).toBe(403);
    expect(mockDocumentUpdate).not.toHaveBeenCalled();
  });

  it("still allows an admin to archive/unarchive/retype exactly as before", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      companyId: "company-1",
      archivedAt: null,
    });
    mockRequireAdmin.mockResolvedValue({ user: ADMIN, error: null } as any);
    mockDocumentUpdate.mockResolvedValue({ id: "doc-1", archivedAt: new Date() });

    const res = await patchDocument(patchReq({ archive: true }), params("doc-1"));
    expect(res.status).toBe(200);
    expect(mockDocumentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "doc-1" } })
    );
  });

  // Part 23, WS51 (F45) — PATCH became admin-only in Part 20/WS46 but never
  // got audit-logged, unlike every other admin mutation route in the app.
  // Action name derives from the archive flag, mirroring
  // admin/templates/[id]/route.ts's PATCH exactly.
  describe("audit logging (F45)", () => {
    it("logs DOCUMENT_ARCHIVED when archive: true", async () => {
      mockDocumentFindUnique.mockResolvedValue({ companyId: "company-1", archivedAt: null });
      mockRequireAdmin.mockResolvedValue({ user: ADMIN, error: null } as any);
      mockDocumentUpdate.mockResolvedValue({ id: "doc-1", archivedAt: new Date() });

      await patchDocument(patchReq({ archive: true }), params("doc-1"));

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        ADMIN,
        "DOCUMENT_ARCHIVED",
        expect.objectContaining({ targetType: "Document", targetId: "doc-1", metadata: { companyId: "company-1" } })
      );
    });

    it("logs DOCUMENT_UNARCHIVED when archive: false", async () => {
      mockDocumentFindUnique.mockResolvedValue({ companyId: "company-1", archivedAt: new Date() });
      mockRequireAdmin.mockResolvedValue({ user: ADMIN, error: null } as any);
      mockDocumentUpdate.mockResolvedValue({ id: "doc-1", archivedAt: null });

      await patchDocument(patchReq({ archive: false }), params("doc-1"));

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        ADMIN,
        "DOCUMENT_UNARCHIVED",
        expect.objectContaining({ targetType: "Document", targetId: "doc-1" })
      );
    });

    it("logs DOCUMENT_RETYPED for a docType-only change", async () => {
      mockDocumentFindUnique.mockResolvedValue({ companyId: "company-1", archivedAt: null });
      mockRequireAdmin.mockResolvedValue({ user: ADMIN, error: null } as any);
      mockDocumentUpdate.mockResolvedValue({ id: "doc-1", docType: "financials" });

      await patchDocument(patchReq({ docType: "financials" }), params("doc-1"));

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        ADMIN,
        "DOCUMENT_RETYPED",
        expect.objectContaining({ targetType: "Document", targetId: "doc-1" })
      );
    });

    it("does not log when the request is rejected before the update (403)", async () => {
      mockDocumentFindUnique.mockResolvedValue({ companyId: "company-1", archivedAt: null });
      mockRequireAdmin.mockResolvedValue({
        user: null,
        error: { status: 403, __marker: "requireAdmin" },
      } as any);

      await patchDocument(patchReq({ archive: true }), params("doc-1"));
      expect(mockLogAdminAction).not.toHaveBeenCalled();
    });
  });

  it("still 404s a missing document before the admin check runs", async () => {
    mockDocumentFindUnique.mockResolvedValue(null);
    const res = await patchDocument(patchReq({ archive: true }), params("doc-1"));
    expect(res.status).toBe(404);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });
});

// Part 19, WS45 (F37) — /view had never gotten the isInternal role check
// that /api/documents/[id] got in Part 16/WS42. Fixed alongside wiring a
// "View" button to it, so this Part doesn't ship a new way to leak
// internal-only document content to non-admins.
describe("GET /api/documents/[id]/view — isInternal enforcement", () => {
  function viewReq() {
    return new Request("https://molly.dfslab.net/api/documents/doc-1/view");
  }

  it("403s a non-admin reading an isInternal document", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-1",
      companyId: "company-1",
      s3Key: "key",
      isInternal: true,
    });
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);

    const res = await getDocumentView(viewReq(), params("doc-1"));
    expect(res.status).toBe(403);
  });

  it("redirects an admin reading the same isInternal document, unchanged", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-1",
      companyId: "company-1",
      s3Key: "key",
      isInternal: true,
    });
    mockRequireCompanyAccess.mockResolvedValue({ user: ADMIN, error: null } as any);

    const res = await getDocumentView(viewReq(), params("doc-1"));
    expect(res.status).not.toBe(403);
    expect(res.headers.get("location")).toBe("https://s3.example.com/signed");
  });

  it("redirects a non-admin reading a non-internal document, unchanged (rich-editor <img> case)", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-1",
      companyId: "company-1",
      s3Key: "key",
      isInternal: false,
    });
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);

    const res = await getDocumentView(viewReq(), params("doc-1"));
    expect(res.status).not.toBe(403);
    expect(res.headers.get("location")).toBe("https://s3.example.com/signed");
  });

  it("still 404s a missing document before the isInternal check runs", async () => {
    mockDocumentFindUnique.mockResolvedValue(null);
    const res = await getDocumentView(viewReq(), params("doc-1"));
    expect(res.status).toBe(404);
    expect(mockRequireCompanyAccess).not.toHaveBeenCalled();
  });
});

// Part 19, WS45 (F38) — GET /api/updates/[id] selected isInternal from
// the DB but never filtered by it (the exact WS42/F33 gap shape, on a
// route WS42 never touched). Fixed alongside making the previously-inert
// Attachments list on /updates/[id] clickable.
describe("GET /api/updates/[id] — isInternal filtering on the documents include", () => {
  function updateReq() {
    return new Request("https://molly.dfslab.net/api/updates/update-1");
  }

  it("a founder's documents include filters out isInternal rows", async () => {
    mockUpdateFindUnique
      .mockResolvedValueOnce({ companyId: "company-1" })
      .mockResolvedValueOnce({ id: "update-1", documents: [] });
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);

    await getUpdate(updateReq(), params("update-1"));

    const secondCallArgs = mockUpdateFindUnique.mock.calls[1][0];
    expect(secondCallArgs.include.documents.where).toEqual({ isInternal: false });
  });

  it("an admin's documents include has no isInternal filter — every row still returned", async () => {
    mockUpdateFindUnique
      .mockResolvedValueOnce({ companyId: "company-1" })
      .mockResolvedValueOnce({ id: "update-1", documents: [] });
    mockRequireCompanyAccess.mockResolvedValue({ user: ADMIN, error: null } as any);

    await getUpdate(updateReq(), params("update-1"));

    const secondCallArgs = mockUpdateFindUnique.mock.calls[1][0];
    expect(secondCallArgs.include.documents.where).toEqual({});
  });

  it("still 404s a missing update before requireCompanyAccess runs", async () => {
    mockUpdateFindUnique.mockResolvedValueOnce(null);
    const res = await getUpdate(updateReq(), params("update-1"));
    expect(res.status).toBe(404);
    expect(mockRequireCompanyAccess).not.toHaveBeenCalled();
  });
});
