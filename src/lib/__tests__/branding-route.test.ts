import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/companies/[id]/branding — mocked db/auth/audit, synthetic data.
vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn(() => Promise.resolve()) }));

const mockFind = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    company: {
      findUnique: (...a: unknown[]) => mockFind(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { PATCH } from "@/app/api/companies/[id]/branding/route";

const access = vi.mocked(requireCompanyAccess);
const audit = vi.mocked(logAdminAction);
const FOUNDER = { id: "u1", email: "founder@acme.com", roles: ["FOUNDER"] };

const params = { params: Promise.resolve({ id: "company-1" }) };
const req = (body: unknown) =>
  new Request("https://molly.dfs.vc/api/companies/company-1/branding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  access.mockReset();
  mockFind.mockReset();
  mockUpdate.mockReset();
  audit.mockClear();
  access.mockResolvedValue({ user: FOUNDER, error: null } as never);
  mockFind.mockResolvedValue({ brandColor: null, logoPlate: "LIGHT" });
  mockUpdate.mockImplementation(({ data }) =>
    Promise.resolve({ id: "company-1", brandColor: null, logoPlate: "LIGHT", ...data })
  );
});

describe("PATCH /api/companies/[id]/branding", () => {
  it("returns the guard's error without touching the db", async () => {
    const denied = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    access.mockResolvedValue({ user: null, error: denied } as never);
    const res = await PATCH(req({ brandColor: "#12a5b0" }), params);
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("normalises the colour, stores it and audits old and new", async () => {
    const res = await PATCH(req({ brandColor: "12A5B0", logoPlate: "BRAND" }), params);
    expect(res.status).toBe(200);
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ brandColor: "#12a5b0", logoPlate: "BRAND" });
    expect(await res.json()).toEqual({ brandColor: "#12a5b0", logoPlate: "BRAND" });
    expect(audit).toHaveBeenCalledWith(
      FOUNDER,
      "COMPANY_BRANDING_UPDATED",
      expect.objectContaining({
        targetType: "Company",
        targetId: "company-1",
        metadata: {
          brandColor: { from: null, to: "#12a5b0" },
          logoPlate: { from: "LIGHT", to: "BRAND" },
        },
      })
    );
  });

  it("expands 3-digit hex", async () => {
    await PATCH(req({ brandColor: "#abc" }), params);
    expect(mockUpdate.mock.calls[0][0].data.brandColor).toBe("#aabbcc");
  });

  it("stores null for the Molly default and for null/empty", async () => {
    mockFind.mockResolvedValue({ brandColor: "#12a5b0", logoPlate: "LIGHT" });
    for (const v of ["#44688E", null, ""]) {
      mockUpdate.mockClear();
      const res = await PATCH(req({ brandColor: v }), params);
      expect(res.status).toBe(200);
      expect(mockUpdate.mock.calls[0][0].data.brandColor).toBeNull();
    }
  });

  it("rejects invalid colours and plates with 400 and writes nothing", async () => {
    for (const body of [
      { brandColor: "red" },
      { brandColor: "#12345" },
      { brandColor: "url(javascript:1)" },
      { brandColor: 5 },
      { logoPlate: "DARK" },
      {},
    ]) {
      const res = await PATCH(req(body), params);
      expect(res.status).toBe(400);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("does not audit a no-op save", async () => {
    mockFind.mockResolvedValue({ brandColor: "#12a5b0", logoPlate: "BRAND" });
    const res = await PATCH(req({ brandColor: "#12A5B0", logoPlate: "BRAND" }), params);
    expect(res.status).toBe(200);
    expect(audit).not.toHaveBeenCalled();
  });

  it("404s for an unknown company", async () => {
    mockFind.mockResolvedValue(null);
    const res = await PATCH(req({ brandColor: "#12a5b0" }), params);
    expect(res.status).toBe(404);
  });
});
