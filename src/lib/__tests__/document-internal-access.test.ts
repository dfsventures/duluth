import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 16, WS42 (F33, Q59) — isInternal was previously a display badge
// only, not access control: any member of the company (any role) could
// list/download internal-only documents via these two routes. Fixed
// narrowly, scoped exactly to GET /api/companies/[id]/documents and
// GET /api/documents/[id] — a role check (admin vs. non-admin), not an
// uploader exception. PATCH (archive/docType edit) is untouched.
// Mocked db/auth-guard, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));
vi.mock("@/lib/s3", () => ({ getDownloadUrl: vi.fn(() => Promise.resolve("https://s3.example.com/signed")) }));

const mockDocumentFindMany = vi.fn();
const mockDocumentFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    document: {
      findMany: (...args: unknown[]) => mockDocumentFindMany(...args),
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args),
    },
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { GET as getCompanyDocuments } from "@/app/api/companies/[id]/documents/route";
import { GET as getDocument } from "@/app/api/documents/[id]/route";

const mockRequireCompanyAccess = vi.mocked(requireCompanyAccess);

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

beforeEach(() => {
  mockRequireCompanyAccess.mockReset();
  mockDocumentFindMany.mockReset();
  mockDocumentFindUnique.mockReset();
});

describe("GET /api/companies/[id]/documents — isInternal filtering", () => {
  it("a founder's query excludes isInternal from the where clause filter (non-admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);
    mockDocumentFindMany.mockResolvedValue([]);

    await getCompanyDocuments(listReq(), params());

    expect(mockDocumentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isInternal: false }),
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
