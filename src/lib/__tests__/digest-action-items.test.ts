import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 37, WS108 — buildDigestActionItems: carry-forward membership, freeze
// after sentAt, never deletes, label/assignee refresh.

const m = {
  digestFind: vi.fn(),
  digestFirst: vi.fn(),
  cardFind: vi.fn(),
  todoFind: vi.fn(),
  todoCreate: vi.fn(),
  todoUpdate: vi.fn(),
  todoDelete: vi.fn(),
  todoDeleteMany: vi.fn(),
};
vi.mock("@/lib/db", () => ({
  db: {
    weeklyDigest: { findUnique: (...a: unknown[]) => m.digestFind(...a), findFirst: (...a: unknown[]) => m.digestFirst(...a) },
    boardCard: { findMany: (...a: unknown[]) => m.cardFind(...a) },
    digestTodo: {
      findMany: (...a: unknown[]) => m.todoFind(...a),
      create: (...a: unknown[]) => m.todoCreate(...a),
      update: (...a: unknown[]) => m.todoUpdate(...a),
      delete: (...a: unknown[]) => m.todoDelete(...a),
      deleteMany: (...a: unknown[]) => m.todoDeleteMany(...a),
    },
  },
}));

import { buildDigestActionItems } from "@/lib/board-server";

const card = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Send deck",
  status: "TODO",
  owner: { displayName: "Jane Founder", userId: null, user: null },
  project: { name: "AcmeHQ onboarding" },
  ...over,
});

describe("buildDigestActionItems", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset());
    m.digestFind.mockResolvedValue({ id: "d1", sentAt: null });
    m.digestFirst.mockResolvedValue(null);
    m.cardFind.mockResolvedValue([]);
    m.todoFind.mockResolvedValue([]);
  });

  it("creates linked rows for open cards with labels and assignee", async () => {
    m.cardFind.mockResolvedValue([
      card(),
      card({ id: "c2", title: "Intro", owner: { displayName: "x", userId: "u1", user: { name: "Sam Partner", email: "s@example.com" } }, project: null }),
    ]);
    const r = await buildDigestActionItems("d1");
    expect(r).toEqual({ created: 2, updated: 0 });
    expect(m.todoCreate.mock.calls[0][0].data).toMatchObject({
      digestId: "d1", cardId: "c1", text: "Send deck", ownerLabel: "Jane Founder", projectLabel: "AcmeHQ onboarding", completed: false, assigneeId: null,
    });
    expect(m.todoCreate.mock.calls[1][0].data).toMatchObject({ cardId: "c2", ownerLabel: "Sam Partner", assigneeId: "u1", projectLabel: null });
  });

  it("carries forward cards completed after the last sent digest, marked completed", async () => {
    const sentAt = new Date("2026-10-01T00:00:00Z");
    m.digestFirst.mockResolvedValue({ sentAt });
    m.cardFind.mockResolvedValue([card({ status: "DONE" })]);
    await buildDigestActionItems("d1");
    const where = m.cardFind.mock.calls[0][0].where;
    expect(where.archivedAt).toBeNull();
    expect(where.OR).toContainEqual({ status: "DONE", completedAt: { gt: sentAt } });
    expect(m.todoCreate.mock.calls[0][0].data.completed).toBe(true);
  });

  it("includes no completed cards when no digest was ever sent", async () => {
    await buildDigestActionItems("d1");
    expect(m.cardFind.mock.calls[0][0].where.OR).toEqual([{ status: { not: "DONE" } }]);
  });

  it("is a no-op once sentAt is set (freeze)", async () => {
    m.digestFind.mockResolvedValue({ id: "d1", sentAt: new Date() });
    const r = await buildDigestActionItems("d1");
    expect(r).toEqual({ created: 0, updated: 0 });
    expect(m.cardFind).not.toHaveBeenCalled();
    expect(m.todoCreate).not.toHaveBeenCalled();
    expect(m.todoUpdate).not.toHaveBeenCalled();
  });

  it("refreshes text, labels, completed and assignee on existing rows, and never deletes", async () => {
    m.todoFind.mockResolvedValue([
      { id: "r1", cardId: "c1", text: "Old title", ownerLabel: null, projectLabel: null, completed: false, assigneeId: null },
      { id: "r2", cardId: "gone", text: "Orphan", ownerLabel: null, projectLabel: null, completed: false, assigneeId: null },
    ]);
    m.cardFind.mockResolvedValue([card({ status: "DONE" })]);
    const r = await buildDigestActionItems("d1");
    expect(r).toEqual({ created: 0, updated: 1 });
    expect(m.todoUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { text: "Send deck", ownerLabel: "Jane Founder", projectLabel: "AcmeHQ onboarding", completed: true, assigneeId: null },
    });
    expect(m.todoDelete).not.toHaveBeenCalled();
    expect(m.todoDeleteMany).not.toHaveBeenCalled();
  });

  it("does not write when a row is already current", async () => {
    m.todoFind.mockResolvedValue([
      { id: "r1", cardId: "c1", text: "Send deck", ownerLabel: "Jane Founder", projectLabel: "AcmeHQ onboarding", completed: false, assigneeId: null },
    ]);
    m.cardFind.mockResolvedValue([card()]);
    expect(await buildDigestActionItems("d1")).toEqual({ created: 0, updated: 0 });
  });
});
