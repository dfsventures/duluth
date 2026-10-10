import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/admin/alerts/[id]: dismiss ({resolved:true}) and its Undo
// ({resolved:false}). Mocked db/auth/audit, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    metricAlert: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { PATCH } from "@/app/api/admin/alerts/[id]/route";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockLog = vi.mocked(logAdminAction);
const ADMIN = { id: "admin-1", email: "admin@dfs.vc", roles: ["ADMIN"] };
const ctx = { params: Promise.resolve({ id: "alert-1" }) };

function req(body: unknown) {
  return new Request("http://x/api/admin/alerts/alert-1", { method: "PATCH", body: JSON.stringify(body) });
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockLog.mockReset();
  mockRequireAdmin.mockResolvedValue({ user: ADMIN, error: null } as never);
  mockFindUnique.mockResolvedValue({ id: "alert-1", rule: "METRIC_CHANGE", companyId: "co-1" });
  mockUpdate.mockResolvedValue({ id: "alert-1" });
});

describe("PATCH /api/admin/alerts/[id]", () => {
  it("rejects non-admins before touching the db", async () => {
    mockRequireAdmin.mockResolvedValue({
      user: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as never);
    const res = await PATCH(req({ resolved: true }), ctx);
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("dismisses with {resolved:true} and audits ALERT_DISMISSED", async () => {
    const res = await PATCH(req({ resolved: true }), ctx);
    expect(res.status).toBe(200);
    const data = mockUpdate.mock.calls[0][0].data;
    expect(data.resolvedAt).toBeInstanceOf(Date);
    expect(data.resolvedById).toBe("admin-1");
    expect(mockLog).toHaveBeenCalledWith(ADMIN, "ALERT_DISMISSED", expect.objectContaining({ targetId: "alert-1" }));
  });

  it("restores with {resolved:false} and audits ALERT_RESTORED", async () => {
    const res = await PATCH(req({ resolved: false }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ resolvedAt: null, resolvedById: null });
    expect(mockLog).toHaveBeenCalledWith(ADMIN, "ALERT_RESTORED", expect.objectContaining({ targetId: "alert-1" }));
  });

  it("rejects anything else with 400 and writes nothing", async () => {
    for (const body of [{}, { resolved: "yes" }, { resolved: null }]) {
      const res = await PATCH(req(body), ctx);
      expect(res.status).toBe(400);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("404s an unknown alert", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await PATCH(req({ resolved: false }), ctx);
    expect(res.status).toBe(404);
  });
});
