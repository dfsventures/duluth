import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Part 23, WS50 (F42, Q67 = Option B) — DELETE /api/admin/documents/[id]/orphan
// re-verifies the object is still missing at delete time, not just trusting
// the earlier scan result. This is the guard the whole "admin-reviewed list,
// not automatic cleanup" decision hinges on: if the object exists again
// (e.g. the row was re-uploaded, or the scan's own check was a transient
// false negative), the delete must be refused (409), not silently proceed.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/s3", () => ({ objectExists: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockFindUnique = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    document: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { objectExists } from "@/lib/s3";
import { logAdminAction } from "@/lib/audit";
import { DELETE } from "@/app/api/admin/documents/[id]/orphan/route";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockObjectExists = vi.mocked(objectExists);
const mockLogAdminAction = vi.mocked(logAdminAction);

const ADMIN_USER = { id: "admin-1", email: "admin@dfs.vc", roles: ["ADMIN"] };

function makeRequest() {
  return new Request("https://molly.dfslab.net/api/admin/documents/doc-1/orphan", { method: "DELETE" });
}

describe("DELETE /api/admin/documents/[id]/orphan", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockDelete.mockReset();
    mockRequireAdmin.mockReset();
    mockObjectExists.mockReset();
    mockLogAdminAction.mockReset();
  });

  it("returns the guard's error when the caller isn't an admin", async () => {
    mockRequireAdmin.mockResolvedValue({
      user: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as never);

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "doc-1" }) });
    expect(res.status).toBe(403);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("404s when the document row doesn't exist", async () => {
    mockRequireAdmin.mockResolvedValue({ user: ADMIN_USER, error: null } as never);
    mockFindUnique.mockResolvedValue(null);

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "missing-doc" }) });
    expect(res.status).toBe(404);
  });

  it("refuses to delete (409) when the object still exists in storage at delete time", async () => {
    mockRequireAdmin.mockResolvedValue({ user: ADMIN_USER, error: null } as never);
    mockFindUnique.mockResolvedValue({
      id: "doc-1",
      name: "pitch-deck.pdf",
      companyId: "co-1",
      s3Key: "documents/doc-1.pdf",
    });
    mockObjectExists.mockResolvedValue(true);

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(res.status).toBe(409);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it("deletes and audit-logs when the object is confirmed still missing", async () => {
    mockRequireAdmin.mockResolvedValue({ user: ADMIN_USER, error: null } as never);
    mockFindUnique.mockResolvedValue({
      id: "doc-1",
      name: "pitch-deck.pdf",
      companyId: "co-1",
      s3Key: "documents/doc-1.pdf",
    });
    mockObjectExists.mockResolvedValue(false);
    mockDelete.mockResolvedValue({});

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "doc-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "doc-1" } });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      ADMIN_USER,
      "DOCUMENT_ORPHAN_DELETED",
      expect.objectContaining({
        targetType: "Document",
        targetId: "doc-1",
        metadata: expect.objectContaining({ name: "pitch-deck.pdf", companyId: "co-1", s3Key: "documents/doc-1.pdf" }),
      })
    );
  });
});
