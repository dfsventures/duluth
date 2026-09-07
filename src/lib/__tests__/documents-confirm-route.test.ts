import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Part 35, WS93.2 (D1 = B) — POST /api/documents/confirm is the only place a
// Document row is ever created, and only after the server's own headObject()
// confirms the bytes actually landed in storage. This is the fix for two
// production incidents where a Document row was created unconditionally at
// presign time, before a single byte had left the browser.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));
vi.mock("@/lib/s3", () => ({ headObject: vi.fn() }));

const mockCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    document: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { headObject } from "@/lib/s3";
import { POST } from "@/app/api/documents/confirm/route";

const mockRequireCompanyAccess = vi.mocked(requireCompanyAccess);
const mockHeadObject = vi.mocked(headObject);

const FOUNDER = { id: "user-1", email: "founder@example.com", roles: ["FOUNDER"] };

function makeRequest(body: unknown) {
  return new Request("https://molly.dfslab.net/api/documents/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  companyId: "co-1",
  name: "cap-table.pdf",
  mimeType: "application/pdf",
  s3Key: "companies/co-1/documents/abc-123.pdf",
};

describe("POST /api/documents/confirm", () => {
  beforeEach(() => {
    mockRequireCompanyAccess.mockReset();
    mockHeadObject.mockReset();
    mockCreate.mockReset();
  });

  it("returns the guard's error when the caller lacks company access", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      user: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as never);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(mockHeadObject).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("502s and creates no row when the object never reached storage", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as never);
    mockHeadObject.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/did not reach storage/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("400s on a key outside the validated company's prefix, even though headObject would succeed", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as never);
    mockHeadObject.mockResolvedValue({ contentLength: 1234 });

    const res = await POST(
      makeRequest({ ...VALID_BODY, s3Key: "companies/OTHER-COMPANY/documents/abc-123.pdf" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid upload key/i);
    expect(mockHeadObject).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the row with size from HeadObject's own answer, not the client, on success", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as never);
    mockHeadObject.mockResolvedValue({ contentLength: 98765 });
    mockCreate.mockResolvedValue({ id: "doc-1", ...VALID_BODY, size: 98765 });

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.id).toBe("doc-1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: "co-1",
          s3Key: VALID_BODY.s3Key,
          size: 98765,
          uploadedById: "user-1",
        }),
      })
    );
  });
});
