import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 37, WS108.4 — POST /api/admin/digest creates digest + cards + linked rows in one transaction.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));
const mockBuild = vi.fn();
vi.mock("@/lib/board-server", () => ({
  buildDigestActionItems: (...a: unknown[]) => mockBuild(...a),
  titleKey: (t: string) => "k_" + t.toLowerCase().replace(/\W+/g, ""),
}));

const tx = {
  weeklyDigest: { create: vi.fn() },
  boardCard: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    boardPerson: { count: vi.fn().mockResolvedValue(1) },
    boardProject: { count: vi.fn().mockResolvedValue(1) },
    weeklyDigest: { findUnique: vi.fn().mockResolvedValue({ id: "x", todos: [] }) },
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { POST } from "@/app/api/admin/digest/route";

const ADMIN = { id: "a1", email: "admin@example.com", roles: ["ADMIN"] };
const post = (body: unknown) =>
  POST(new Request("https://molly.dfs.vc/api/admin/digest", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/admin/digest", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, error: null } as never);
    tx.weeklyDigest.create.mockReset();
    tx.boardCard.findMany.mockReset().mockResolvedValue([]);
    tx.boardCard.findFirst.mockReset().mockResolvedValue(null);
    tx.boardCard.create.mockReset();
    mockBuild.mockReset();
  });

  const base = { weekOf: "2026-10-08", title: "TEST", sections: [] };

  it("creates a DIGEST_PASTE card per new todo (human-reviewed) then builds the action items in the same tx", async () => {
    const res = await post({
      ...base,
      todos: [{ text: "Send deck", ownerId: "p1", projectId: "pr1", ownerRaw: "Jayne", needsReview: false }, { text: "Chase intro", ownerRaw: "Sam", needsReview: true }],
    });
    expect(res.status).toBe(201);
    expect(tx.boardCard.create).toHaveBeenCalledTimes(2);
    const first = tx.boardCard.create.mock.calls[0][0].data;
    expect(first).toMatchObject({ title: "Send deck", source: "DIGEST_PASTE", ownerId: "p1", rawOwnerName: "Jayne", needsReview: false });
    expect(first.humanEditedAt).toBeInstanceOf(Date);
    expect(first.sourceKey).toMatch(/^paste:.+:k_senddeck$/);
    expect(tx.boardCard.create.mock.calls[1][0].data).toMatchObject({ ownerId: null, rawOwnerName: "Sam", needsReview: true });
    expect(mockBuild).toHaveBeenCalledWith(expect.any(String), tx);
  });

  it("links (does not create) a todo that restates an open card", async () => {
    tx.boardCard.findMany.mockResolvedValue([
      { id: "c1", sourceKey: null, humanEditedAt: new Date(), ownerId: null, projectId: null, dueDate: null },
    ]);
    await post({ ...base, todos: [{ text: "Send deck", existingCardId: "c1" }] });
    expect(tx.boardCard.create).not.toHaveBeenCalled();
    expect(mockBuild).toHaveBeenCalled();
  });

  it("skips a duplicate title within one digest", async () => {
    await post({ ...base, todos: [{ text: "Send deck" }, { text: "send deck" }] });
    expect(tx.boardCard.create).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty todo text with 400 and writes nothing", async () => {
    const res = await post({ ...base, todos: [{ text: "  " }] });
    expect(res.status).toBe(400);
    expect(tx.weeklyDigest.create).not.toHaveBeenCalled();
  });
});
