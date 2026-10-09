import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 37, WS104.4/.5 (F104/F107) — PATCH /api/admin/digest/[id] diffs todos
// instead of delete-all/recreate (which wiped ticks and assignees), and the
// todo-toggle route is scoped to the digest in its path.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockBuild = vi.fn();
const mockMoveIn = vi.fn();
vi.mock("@/lib/board-server", () => ({
  buildDigestActionItems: (...a: unknown[]) => mockBuild(...a),
  endPosition: vi.fn().mockResolvedValue(1024),
  moveCardIn: (...a: unknown[]) => mockMoveIn(...a),
}));

const tx = {
  weeklyDigest: { update: vi.fn() },
  digestTodo: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  boardCard: { findUnique: vi.fn() },
};
const mockBoardCardCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    weeklyDigest: {
      findUnique: vi.fn().mockResolvedValue({ sentAt: null, id: "d1", todos: [] }),
    },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    boardCard: { create: (...a: unknown[]) => mockBoardCardCreate(...a) },
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { PATCH } from "@/app/api/admin/digest/[id]/route";
import { PATCH as TOGGLE } from "@/app/api/admin/digest/[id]/todos/[todoId]/route";

const ADMIN = { id: "a1", email: "admin@example.com", roles: ["ADMIN"] };

function req(body: unknown) {
  return new Request("https://molly.dfs.vc/api/admin/digest/d1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/digest/[id] todos diff", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, error: null } as never);
    Object.values(tx.digestTodo).forEach((m) => m.mockReset());
    tx.weeklyDigest.update.mockReset().mockResolvedValue({ id: "d1" });
    tx.digestTodo.findMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
    tx.digestTodo.deleteMany.mockResolvedValue({ count: 1 });
    tx.digestTodo.updateMany.mockResolvedValue({ count: 1 });
    tx.digestTodo.create.mockResolvedValue({});
    mockBoardCardCreate.mockReset().mockResolvedValue({ id: "c1", title: "new", status: "TODO" });
    mockBuild.mockReset();
  });

  it("updates existing ids, creates new rows, deletes only ids absent from the payload", async () => {
    const res = await PATCH(req({ todos: [{ id: "t1", text: "edited" }, { text: "new" }] }), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(200);
    expect(tx.digestTodo.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.digestTodo.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", digestId: "d1", cardId: null },
      data: { text: "edited" },
    });
    // WS108.5: on a draft, a new todo becomes a MANUAL board card + a rebuilt linked row
    expect(tx.digestTodo.create).not.toHaveBeenCalled();
    expect(mockBoardCardCreate).toHaveBeenCalledTimes(1);
    expect(mockBoardCardCreate.mock.calls[0][0].data).toMatchObject({ title: "new", source: "MANUAL" });
    expect(mockBuild).toHaveBeenCalledWith("d1");
    expect(tx.digestTodo.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.digestTodo.deleteMany).toHaveBeenCalledWith({
      where: { digestId: "d1", id: { in: ["t2", "t3"] } },
    });
  });

  it("never calls deleteMany without an id filter, and skips it when nothing was removed", async () => {
    await PATCH(
      req({ todos: [{ id: "t1", text: "a" }, { id: "t2", text: "b" }, { id: "t3", text: "c" }] }),
      { params: Promise.resolve({ id: "d1" }) }
    );
    expect(tx.digestTodo.deleteMany).not.toHaveBeenCalled();
    for (const call of tx.digestTodo.deleteMany.mock.calls) {
      expect(call[0].where.id).toBeDefined();
    }
  });

  it("leaves todos untouched when the body has no todos array", async () => {
    await PATCH(req({ title: "New title" }), { params: Promise.resolve({ id: "d1" }) });
    expect(tx.digestTodo.findMany).not.toHaveBeenCalled();
    expect(tx.digestTodo.deleteMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/digest/[id]/todos/[todoId] (F107, WS108.6)", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, error: null } as never);
    tx.digestTodo.updateMany.mockReset();
    tx.digestTodo.findUnique.mockReset();
    tx.boardCard.findUnique.mockReset();
    mockMoveIn.mockReset();
  });

  function toggle(completed = true) {
    return TOGGLE(req({ completed }), { params: Promise.resolve({ id: "d1", todoId: "t9" }) });
  }

  it("scopes the update to the digest id in the path", async () => {
    tx.digestTodo.updateMany.mockResolvedValue({ count: 1 });
    tx.digestTodo.findUnique.mockResolvedValue({ id: "t9", completed: true, cardId: null });
    const res = await toggle();
    expect(res.status).toBe(200);
    expect(tx.digestTodo.updateMany).toHaveBeenCalledWith({
      where: { id: "t9", digestId: "d1" },
      data: { completed: true },
    });
    expect(mockMoveIn).not.toHaveBeenCalled();
  });

  it("returns 404 when the todo belongs to another digest", async () => {
    tx.digestTodo.updateMany.mockResolvedValue({ count: 0 });
    const res = await toggle();
    expect(res.status).toBe(404);
    expect(tx.digestTodo.findUnique).not.toHaveBeenCalled();
  });

  it("ticking a linked row moves its card to DONE in the same transaction", async () => {
    tx.digestTodo.updateMany.mockResolvedValue({ count: 1 });
    tx.digestTodo.findUnique.mockResolvedValue({ id: "t9", completed: true, cardId: "c1" });
    tx.boardCard.findUnique.mockResolvedValue({ status: "TODO", archivedAt: null });
    await toggle(true);
    expect(mockMoveIn).toHaveBeenCalledWith(tx, "c1", "DONE", undefined, undefined, ADMIN);
  });

  it("unticking a linked row returns a DONE card to TODO", async () => {
    tx.digestTodo.updateMany.mockResolvedValue({ count: 1 });
    tx.digestTodo.findUnique.mockResolvedValue({ id: "t9", completed: false, cardId: "c1" });
    tx.boardCard.findUnique.mockResolvedValue({ status: "DONE", archivedAt: null });
    await toggle(false);
    expect(mockMoveIn).toHaveBeenCalledWith(tx, "c1", "TODO", undefined, undefined, ADMIN);
  });

  it("does not move a card that is already in the target state", async () => {
    tx.digestTodo.updateMany.mockResolvedValue({ count: 1 });
    tx.digestTodo.findUnique.mockResolvedValue({ id: "t9", completed: true, cardId: "c1" });
    tx.boardCard.findUnique.mockResolvedValue({ status: "DONE", archivedAt: null });
    await toggle(true);
    expect(mockMoveIn).not.toHaveBeenCalled();
  });
});
