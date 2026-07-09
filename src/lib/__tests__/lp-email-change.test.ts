import { describe, it, expect, vi, beforeEach } from "vitest";

// WS16 acceptance item (Q10): "LP email change revokes sessions ... assert
// the deleteMany is in the transaction via code review + unit test." This
// exercises the actual PATCH /api/admin/lps/[id] handler with a mocked db,
// synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockFindUnique = vi.fn();
const mockLpUpdate = vi.fn();
const mockDeleteMany = vi.fn();
const mockLpFindUniqueByEmail = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    limitedPartner: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        limitedPartner: { update: (...args: unknown[]) => mockLpUpdate(...args) },
        lpSession: { deleteMany: (...args: unknown[]) => mockDeleteMany(...args) },
      }),
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { PATCH } from "@/app/api/admin/lps/[id]/route";

const mockRequireAdmin = vi.mocked(requireAdmin);

function req(body: unknown) {
  return new Request("https://molly.dfslab.net/api/admin/lps/lp-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockFindUnique.mockReset();
  mockLpUpdate.mockReset();
  mockDeleteMany.mockReset();
  mockLpFindUniqueByEmail.mockReset();
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue({ user: { id: "admin-1", email: "admin@dfs.vc" }, error: null } as any);
});

describe("PATCH /api/admin/lps/[id] — email change (Q10)", () => {
  it("revokes all sessions in the same transaction when the email changes", async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: "lp-1", email: "old@example.com", name: "Test LP" }) // existing lookup
      .mockResolvedValueOnce(null); // clash check for the new email
    mockLpUpdate.mockResolvedValue({ id: "lp-1", email: "new@example.com", name: "Test LP" });

    const res = await PATCH(req({ email: "new@example.com" }), { params: Promise.resolve({ id: "lp-1" }) });

    expect(res.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { lpId: "lp-1" } });
  });

  it("does not touch sessions when only the name changes", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "lp-1", email: "same@example.com", name: "Old Name" });
    mockLpUpdate.mockResolvedValue({ id: "lp-1", email: "same@example.com", name: "New Name" });

    const res = await PATCH(req({ name: "New Name" }), { params: Promise.resolve({ id: "lp-1" }) });

    expect(res.status).toBe(200);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("rejects an email that already belongs to another LP", async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: "lp-1", email: "old@example.com", name: null })
      .mockResolvedValueOnce({ id: "lp-2", email: "taken@example.com", name: null });

    const res = await PATCH(req({ email: "taken@example.com" }), { params: Promise.resolve({ id: "lp-1" }) });

    expect(res.status).toBe(400);
    expect(mockLpUpdate).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
