import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 37, WS107 — POST /api/admin/board/import-latest-digest

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/board-server", () => ({
  ensureAdminPeople: vi.fn(),
  loadBoardContext: vi.fn(),
}));

// In-memory stand-ins so a second run sees the first run's writes.
const state = {
  todos: [] as { id: string; text: string; completed: boolean; cardId: string | null; assigneeId: string | null }[],
  cards: [] as { id: string; sourceKey: string }[],
};
const tx = {
  boardCard: {
    create: vi.fn(async ({ data }: any) => {
      const card = { id: `card-${state.cards.length + 1}`, sourceKey: data.sourceKey };
      state.cards.push(card);
      return card;
    }),
  },
  digestTodo: {
    update: vi.fn(async ({ where, data }: any) => {
      const t = state.todos.find((x) => x.id === where.id)!;
      t.cardId = data.cardId;
    }),
  },
};
vi.mock("@/lib/db", () => ({
  db: {
    weeklyDigest: {
      findFirst: vi.fn(async () => ({
        id: "d1",
        title: "Weekly",
        weekOf: new Date("2026-10-01"),
        todos: state.todos.filter((t) => !t.completed && !t.cardId),
      })),
    },
    boardPerson: { findMany: vi.fn(async () => []) },
    boardCard: {
      findMany: vi.fn(async () => state.cards.map((c) => ({ sourceKey: c.sourceKey }))),
      findFirst: vi.fn(async () => null),
    },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { loadBoardContext } from "@/lib/board-server";
import { POST } from "@/app/api/admin/board/import-latest-digest/route";
import { splitOwnerSuffix } from "@/lib/board";

const ADMIN = { id: "a1", email: "admin@example.com", roles: ["ADMIN"] };
const call = (body: unknown) =>
  POST(
    new Request("https://molly.dfs.vc/api/admin/board/import-latest-digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

describe("splitOwnerSuffix", () => {
  it("splits a trailing em-dash name", () => {
    expect(splitOwnerSuffix("Send the AcmeHQ onboarding deck — Jane Founder")).toEqual({
      title: "Send the AcmeHQ onboarding deck",
      ownerRaw: "Jane Founder",
    });
  });
  it("leaves text without a suffix alone", () => {
    expect(splitOwnerSuffix("Send the deck")).toEqual({ title: "Send the deck", ownerRaw: null });
  });
});

describe("POST /api/admin/board/import-latest-digest", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, error: null } as never);
    vi.mocked(logAdminAction).mockReset();
    tx.boardCard.create.mockClear();
    tx.digestTodo.update.mockClear();
    state.cards = [];
    state.todos = [
      { id: "t1", text: "Send the AcmeHQ onboarding deck — Jane Founder", completed: false, cardId: null, assigneeId: null },
      { id: "t2", text: "Chase the intro — Sam", completed: false, cardId: null, assigneeId: null },
      { id: "t3", text: "Already done item", completed: true, cardId: null, assigneeId: null },
    ];
    vi.mocked(loadBoardContext).mockResolvedValue({
      people: [{ id: "p1", name: "Jane Founder", aliases: [] }],
      projects: [],
      openCards: [],
    } as never);
  });

  it("requires admin", async () => {
    const denied = new Response(null, { status: 401 });
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, error: denied } as never);
    expect((await call({ dryRun: true })).status).toBe(401);
  });

  it("dry run previews open todos and creates nothing", async () => {
    const res = await call({ dryRun: true });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(2);
    expect(json.items[0]).toMatchObject({ ownerId: "p1", ownerLabel: "Jane Founder", needsReview: false });
    expect(json.items[1]).toMatchObject({ ownerId: null, rawOwnerName: "Sam", needsReview: true });
    expect(tx.boardCard.create).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("creates cards once, links todos, and a second run creates nothing new", async () => {
    const first = await (await call({ dryRun: false })).json();
    expect(first.created).toBe(2);
    expect(tx.boardCard.create.mock.calls[0][0].data).toMatchObject({
      source: "DIGEST_IMPORT",
      sourceKey: "import:t1",
      ownerId: "p1",
      needsReview: false,
    });
    expect(tx.boardCard.create.mock.calls[1][0].data).toMatchObject({
      sourceKey: "import:t2",
      needsReview: true,
      rawOwnerName: "Sam",
    });
    expect(state.todos[0].cardId).toBe("card-1");
    expect(logAdminAction).toHaveBeenCalledWith(ADMIN, "BOARD_DIGEST_IMPORTED", expect.anything());

    tx.boardCard.create.mockClear();
    const second = await (await call({ dryRun: false })).json();
    expect(second.created).toBe(0);
    expect(tx.boardCard.create).not.toHaveBeenCalled();
  });
});
