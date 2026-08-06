import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 26 (WS60): POST/DELETE/PATCH /api/admin/lps/[id]/emails — address
// add/remove/set-primary, the D3 revoke-only-at-zero-addresses rule, and the
// D1 global-uniqueness clash check against LpEmail (not LimitedPartner.email).

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockLpFindUnique = vi.fn();
const mockLpEmailFindUnique = vi.fn();
const mockLpEmailCount = vi.fn();
const mockLpEmailCreate = vi.fn();
const mockLpEmailUpdateMany = vi.fn();
const mockLpEmailUpdate = vi.fn();
const mockLpEmailDelete = vi.fn();
const mockLpEmailFindMany = vi.fn();
const mockLpUpdate = vi.fn();
const mockSessionDeleteMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    limitedPartner: {
      findUnique: (...args: unknown[]) => mockLpFindUnique(...args),
    },
    lpEmail: {
      findUnique: (...args: unknown[]) => mockLpEmailFindUnique(...args),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        lpEmail: {
          count: (...args: unknown[]) => mockLpEmailCount(...args),
          create: (...args: unknown[]) => mockLpEmailCreate(...args),
          updateMany: (...args: unknown[]) => mockLpEmailUpdateMany(...args),
          update: (...args: unknown[]) => mockLpEmailUpdate(...args),
          delete: (...args: unknown[]) => mockLpEmailDelete(...args),
          findMany: (...args: unknown[]) => mockLpEmailFindMany(...args),
        },
        limitedPartner: { update: (...args: unknown[]) => mockLpUpdate(...args) },
        lpSession: { deleteMany: (...args: unknown[]) => mockSessionDeleteMany(...args) },
      }),
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { POST, DELETE, PATCH } from "@/app/api/admin/lps/[id]/emails/route";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockAudit = vi.mocked(logAdminAction);

function req(method: string, body: unknown) {
  return new Request("https://molly.dfslab.net/api/admin/lps/lp-1/emails", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "lp-1" }) };

beforeEach(() => {
  mockLpFindUnique.mockReset();
  mockLpEmailFindUnique.mockReset();
  mockLpEmailCount.mockReset();
  mockLpEmailCreate.mockReset();
  mockLpEmailUpdateMany.mockReset();
  mockLpEmailUpdate.mockReset();
  mockLpEmailDelete.mockReset();
  mockLpEmailFindMany.mockReset();
  mockLpUpdate.mockReset();
  mockSessionDeleteMany.mockReset();
  mockRequireAdmin.mockReset();
  mockAudit.mockReset();

  mockRequireAdmin.mockResolvedValue({ user: { id: "admin-1", email: "admin@dfs.vc" }, error: null } as any);
  mockLpFindUnique.mockResolvedValue({ id: "lp-1", email: "primary@example.com", name: "Test LP" });
});

describe("POST /api/admin/lps/[id]/emails — add address", () => {
  it("rejects an address already held by another LP (D1 — checked against LpEmail globally)", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce({ id: "e-9", lpId: "lp-2", email: "taken@example.com", isPrimary: false });

    const res = await POST(req("POST", { email: "taken@example.com" }), params);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/already uses this email/);
    expect(mockLpEmailCreate).not.toHaveBeenCalled();
  });

  it("makes the first address for an LP primary and syncs the mirror, even if isPrimary wasn't requested", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce(null);
    mockLpEmailCount.mockResolvedValueOnce(0);
    mockLpEmailCreate.mockResolvedValueOnce({ id: "e-1", lpId: "lp-1", email: "first@example.com", isPrimary: true });

    const res = await POST(req("POST", { email: "first@example.com" }), params);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.isPrimary).toBe(true);
    expect(mockLpUpdate).toHaveBeenCalledWith({ where: { id: "lp-1" }, data: { email: "first@example.com" } });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      "LP_EMAIL_ADDED",
      expect.objectContaining({ metadata: { email: "first@example.com", isPrimary: true } })
    );
  });

  it("adds a second, non-primary address without touching the mirror", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce(null);
    mockLpEmailCount.mockResolvedValueOnce(1);
    mockLpEmailCreate.mockResolvedValueOnce({ id: "e-2", lpId: "lp-1", email: "second@example.com", isPrimary: false });

    const res = await POST(req("POST", { email: "second@example.com" }), params);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.isPrimary).toBe(false);
    expect(mockLpUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/lps/[id]/emails — remove address (D3)", () => {
  it("does not revoke sessions when a non-last, non-primary address is removed", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce({ id: "e-2", lpId: "lp-1", email: "second@example.com", isPrimary: false });
    mockLpEmailFindMany.mockResolvedValueOnce([{ id: "e-1", lpId: "lp-1", email: "primary@example.com", isPrimary: true }]);

    const res = await DELETE(req("DELETE", { email: "second@example.com" }), params);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sessionsRevoked).toBe(false);
    expect(mockSessionDeleteMany).not.toHaveBeenCalled();
    expect(mockLpUpdate).not.toHaveBeenCalled(); // wasn't primary, so no mirror resync
  });

  it("promotes the oldest remaining address and re-syncs the mirror when the primary is removed, without revoking sessions", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce({ id: "e-1", lpId: "lp-1", email: "primary@example.com", isPrimary: true });
    mockLpEmailFindMany.mockResolvedValueOnce([{ id: "e-2", lpId: "lp-1", email: "second@example.com", isPrimary: false }]);

    const res = await DELETE(req("DELETE", { email: "primary@example.com" }), params);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sessionsRevoked).toBe(false);
    expect(mockSessionDeleteMany).not.toHaveBeenCalled();
    expect(mockLpEmailUpdate).toHaveBeenCalledWith({ where: { id: "e-2" }, data: { isPrimary: true } });
    expect(mockLpUpdate).toHaveBeenCalledWith({ where: { id: "lp-1" }, data: { email: "second@example.com" } });
  });

  it("revokes all sessions and nulls the mirror only when the LAST address is removed", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce({ id: "e-1", lpId: "lp-1", email: "primary@example.com", isPrimary: true });
    mockLpEmailFindMany.mockResolvedValueOnce([]); // zero remaining

    const res = await DELETE(req("DELETE", { email: "primary@example.com" }), params);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sessionsRevoked).toBe(true);
    expect(mockSessionDeleteMany).toHaveBeenCalledWith({ where: { lpId: "lp-1" } });
    expect(mockLpUpdate).toHaveBeenCalledWith({ where: { id: "lp-1" }, data: { email: null } });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      "LP_EMAIL_REMOVED",
      expect.objectContaining({ metadata: { email: "primary@example.com", sessionsRevoked: true } })
    );
  });

  it("404s when the address doesn't belong to this LP", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce({ id: "e-9", lpId: "lp-2", email: "other@example.com", isPrimary: true });

    const res = await DELETE(req("DELETE", { email: "other@example.com" }), params);
    expect(res.status).toBe(404);
    expect(mockLpEmailDelete).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/lps/[id]/emails — set primary", () => {
  it("marks the target primary, clears the old primary, syncs the mirror, and never touches sessions", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce({ id: "e-2", lpId: "lp-1", email: "second@example.com", isPrimary: false });

    const res = await PATCH(req("PATCH", { email: "second@example.com" }), params);

    expect(res.status).toBe(200);
    expect(mockLpEmailUpdateMany).toHaveBeenCalledWith({ where: { lpId: "lp-1", id: { not: "e-2" } }, data: { isPrimary: false } });
    expect(mockLpEmailUpdate).toHaveBeenCalledWith({ where: { id: "e-2" }, data: { isPrimary: true } });
    expect(mockLpUpdate).toHaveBeenCalledWith({ where: { id: "lp-1" }, data: { email: "second@example.com" } });
    expect(mockSessionDeleteMany).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      "LP_EMAIL_PRIMARY_CHANGED",
      expect.objectContaining({ metadata: { email: "second@example.com" } })
    );
  });
});
