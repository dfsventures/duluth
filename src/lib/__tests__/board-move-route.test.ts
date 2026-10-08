import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 37, WS106.5 — POST /api/admin/board/cards/[id]/move

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const tx = {
  boardCard: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  db: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { POST } from "@/app/api/admin/board/cards/[id]/move/route";

const ADMIN = { id: "a1", email: "admin@example.com", roles: ["ADMIN"] };

function req(body: unknown) {
  return new Request("https://molly.dfs.vc/api/admin/board/cards/c1/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const call = (body: unknown) => POST(req(body), { params: Promise.resolve({ id: "c1" }) });

function lastUpdateData() {
  const calls = tx.boardCard.update.mock.calls.filter((c) => c[0].where.id === "c1");
  return calls[calls.length - 1][0].data;
}

describe("POST /api/admin/board/cards/[id]/move", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, error: null } as never);
    vi.mocked(logAdminAction).mockReset();
    Object.values(tx.boardCard).forEach((m) => m.mockReset());
    tx.boardCard.findMany.mockResolvedValue([
      { id: "x1", position: 1024 },
      { id: "x2", position: 2048 },
    ]);
    tx.boardCard.update.mockImplementation(async ({ data }: any) => ({ id: "c1", ...data }));
  });

  it("sets completedAt when entering DONE and stamps humanEditedAt/updatedById", async () => {
    tx.boardCard.findUnique.mockResolvedValue({ id: "c1", title: "AcmeHQ onboarding", status: "IN_PROGRESS" });
    const res = await call({ status: "DONE" });
    expect(res.status).toBe(200);
    const data = lastUpdateData();
    expect(data.status).toBe("DONE");
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.humanEditedAt).toBeInstanceOf(Date);
    expect(data.updatedById).toBe("a1");
    expect(data.position).toBe(3072); // end of column
    expect(logAdminAction).toHaveBeenCalledWith(ADMIN, "BOARD_CARD_MOVED", expect.anything());
  });

  it("clears completedAt when leaving DONE", async () => {
    tx.boardCard.findUnique.mockResolvedValue({ id: "c1", status: "DONE", completedAt: new Date() });
    await call({ status: "TODO" });
    expect(lastUpdateData().completedAt).toBeNull();
  });

  it("leaves completedAt alone when reordering inside DONE", async () => {
    tx.boardCard.findUnique.mockResolvedValue({ id: "c1", status: "DONE", completedAt: new Date() });
    await call({ status: "DONE" });
    expect("completedAt" in lastUpdateData()).toBe(false);
  });

  it("places the card between beforeId and the next card", async () => {
    tx.boardCard.findUnique.mockResolvedValue({ id: "c1", status: "TODO" });
    await call({ status: "TODO", beforeId: "x1" });
    expect(lastUpdateData().position).toBe(1536);
  });

  it("places the card at the top with afterId of the first card", async () => {
    tx.boardCard.findUnique.mockResolvedValue({ id: "c1", status: "TODO" });
    await call({ status: "TODO", afterId: "x1" });
    expect(lastUpdateData().position).toBe(0);
  });

  it("renormalizes the column when neighbours have collapsed", async () => {
    tx.boardCard.findUnique.mockResolvedValue({ id: "c1", status: "TODO" });
    tx.boardCard.findMany.mockResolvedValue([
      { id: "x1", position: 5 },
      { id: "x2", position: 5 + 1e-8 },
    ]);
    await call({ status: "TODO", beforeId: "x1" });
    const renumbered = tx.boardCard.update.mock.calls.filter((c) => c[0].where.id !== "c1");
    expect(renumbered.map((c) => c[0].data.position)).toEqual([1024, 2048]);
    expect(lastUpdateData().position).toBe(1536);
  });

  it("rejects an invalid status with 400 and does not write", async () => {
    const res = await call({ status: "NOPE" });
    expect(res.status).toBe(400);
    expect(tx.boardCard.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown card", async () => {
    tx.boardCard.findUnique.mockResolvedValue(null);
    const res = await call({ status: "TODO" });
    expect(res.status).toBe(404);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("returns the guard error for non-admins", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      error: new Response(null, { status: 403 }),
    } as never);
    const res = await call({ status: "TODO" });
    expect(res.status).toBe(403);
  });
});
