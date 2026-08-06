import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 26 (WS60, D3): the old "any email edit revokes all sessions" behavior
// on PATCH /api/admin/lps/[id] is retired — that route is name-only now.
// Session revocation moves to /api/admin/lps/[id]/emails and only fires when
// removing an address would leave the LP with ZERO addresses.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockFindUnique = vi.fn();
const mockLpUpdate = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    limitedPartner: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockLpUpdate(...args),
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
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue({ user: { id: "admin-1", email: "admin@dfs.vc" }, error: null } as any);
});

describe("PATCH /api/admin/lps/[id] — name-only (Part 26/WS60)", () => {
  it("updates the name and never touches sessions", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "lp-1", email: "same@example.com", name: "Old Name" });
    mockLpUpdate.mockResolvedValue({ id: "lp-1", email: "same@example.com", name: "New Name" });

    const res = await PATCH(req({ name: "New Name" }), { params: Promise.resolve({ id: "lp-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.name).toBe("New Name");
    expect(mockLpUpdate).toHaveBeenCalledWith({ where: { id: "lp-1" }, data: { name: "New Name" } });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("ignores an email field in the request body — no longer a supported param", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "lp-1", email: "old@example.com", name: "Test LP" });
    mockLpUpdate.mockResolvedValue({ id: "lp-1", email: "old@example.com", name: "Test LP" });

    const res = await PATCH(req({ email: "new@example.com" }), { params: Promise.resolve({ id: "lp-1" }) });

    expect(res.status).toBe(200);
    // email is silently dropped — the update call carries no email key
    expect(mockLpUpdate).toHaveBeenCalledWith({ where: { id: "lp-1" }, data: {} });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("404s when the LP doesn't exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await PATCH(req({ name: "X" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });
});
