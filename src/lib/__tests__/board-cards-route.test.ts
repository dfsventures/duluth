import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 38 (WS114, F118): POST /api/admin/board/cards and PATCH …/cards/[id]
// with owner arrays, the legacy single-owner body, and the review flag.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const m = vi.hoisted(() => ({
  boardPerson: { count: vi.fn() },
  boardProject: { findUnique: vi.fn() },
  boardCard: {
    findFirst: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  boardCardOwner: { deleteMany: vi.fn(), createMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  db: { ...m, $transaction: (fn: (t: typeof m) => unknown) => fn(m) },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { POST } from "@/app/api/admin/board/cards/route";
import { PATCH } from "@/app/api/admin/board/cards/[id]/route";

const ADMIN = { id: "a1", email: "admin@example.com", roles: ["ADMIN"] };

const post = (body: unknown) =>
  POST(
    new Request("https://molly.dfs.vc/api/admin/board/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
const patch = (body: unknown) =>
  PATCH(
    new Request("https://molly.dfs.vc/api/admin/board/cards/c1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "c1" }) }
  );

function baseCard(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    title: "Send AcmeHQ onboarding deck",
    status: "TODO",
    projectId: null,
    rawProjectName: null,
    needsReview: false,
    unmatchedOwnerNames: [],
    owners: [],
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, error: null } as never);
  vi.mocked(logAdminAction).mockReset();
  for (const g of Object.values(m)) Object.values(g).forEach((f) => f.mockReset());
  m.boardPerson.count.mockImplementation(async ({ where }: any) => where.id.in.filter((x: string) => x !== "ghost").length);
  m.boardCard.findFirst.mockResolvedValue(null);
  m.boardCard.create.mockImplementation(async ({ data }: any) => ({
    id: "c1",
    ...data,
    owners: (data.owners?.create ?? []).map((o: any) => ({ personId: o.personId })),
  }));
  m.boardCard.update.mockImplementation(async ({ data }: any) => ({ id: "c1", ...data }));
  m.boardCard.findUniqueOrThrow.mockImplementation(async () => ({
    id: "c1",
    ownerId: "p1",
    owners: [{ personId: "p1" }, { personId: "p2" }],
  }));
});

describe("POST /api/admin/board/cards", () => {
  it("creates with two owners: nested creates and the legacy ownerId = first", async () => {
    const res = await post({ title: "Send deck", ownerIds: ["p1", "p2"] });
    expect(res.status).toBe(201);
    const data = m.boardCard.create.mock.calls[0][0].data;
    expect(data.owners).toEqual({ create: [{ personId: "p1" }, { personId: "p2" }] });
    expect(data.ownerId).toBe("p1");
    const body = await res.json();
    expect(body.ownerIds).toEqual(["p1", "p2"]);
    expect(body.owners).toBeUndefined();
  });

  it("still accepts the legacy ownerId body", async () => {
    const res = await post({ title: "Send deck", ownerId: "p1" });
    expect(res.status).toBe(201);
    const data = m.boardCard.create.mock.calls[0][0].data;
    expect(data.owners).toEqual({ create: [{ personId: "p1" }] });
    expect(data.ownerId).toBe("p1");
    expect((await res.json()).ownerIds).toEqual(["p1"]);
  });

  it("creates unassigned with no owner fields", async () => {
    const res = await post({ title: "Send deck" });
    expect(res.status).toBe(201);
    const data = m.boardCard.create.mock.calls[0][0].data;
    expect(data.owners).toBeUndefined();
    expect(data.ownerId).toBeNull();
    expect((await res.json()).ownerIds).toEqual([]);
  });

  it("400s on an unknown owner id and on a sixth owner", async () => {
    const r1 = await post({ title: "Send deck", ownerIds: ["p1", "ghost"] });
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toBe("Unknown owner");
    const r2 = await post({ title: "Send deck", ownerIds: ["a", "b", "c", "d", "e", "f"] });
    expect(r2.status).toBe(400);
    expect(m.boardCard.create).not.toHaveBeenCalled();
  });

  it("allows exactly five owners", async () => {
    const res = await post({ title: "Send deck", ownerIds: ["a", "b", "c", "d", "e"] });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/admin/board/cards/[id]", () => {
  it("ownerIds: [] clears owners and unmatched names and recomputes the flag", async () => {
    m.boardCard.findUnique.mockResolvedValue(
      baseCard({ needsReview: true, unmatchedOwnerNames: ["Sam P"], owners: [{ personId: "p1", rawName: null }] })
    );
    const res = await patch({ ownerIds: [] });
    expect(res.status).toBe(200);
    expect(m.boardCardOwner.deleteMany).toHaveBeenCalledWith({ where: { cardId: "c1", personId: { notIn: [] } } });
    // First update is the scalar write; the helper then writes legacy fields + clears unmatched.
    expect(m.boardCard.update.mock.calls[0][0].data.needsReview).toBe(false);
    const helperData = m.boardCard.update.mock.calls[1][0].data;
    expect(helperData).toMatchObject({ ownerId: null, rawOwnerName: null, unmatchedOwnerNames: [] });
  });

  it("keeps the flag when an unmatched project remains", async () => {
    m.boardCard.findUnique.mockResolvedValue(
      baseCard({ needsReview: true, unmatchedOwnerNames: ["Sam P"], rawProjectName: "Acme thing", projectId: null })
    );
    await patch({ ownerIds: ["p1"] });
    expect(m.boardCard.update.mock.calls[0][0].data.needsReview).toBe(true);
  });

  it("does not flag a card whose project was matched via alias (F117)", async () => {
    m.boardCard.findUnique.mockResolvedValue(baseCard({ rawProjectName: "AcmeHQ", projectId: "j1" }));
    await patch({ ownerIds: ["p1"] });
    expect(m.boardCard.update.mock.calls[0][0].data.needsReview).toBe(false);
  });

  it("sets two owners, dual-writes the legacy first owner, keeps raw names for owners who stay", async () => {
    m.boardCard.findUnique.mockResolvedValue(baseCard({ owners: [{ personId: "p1", rawName: "Sam" }] }));
    const res = await patch({ ownerIds: ["p1", "p2"] });
    expect(res.status).toBe(200);
    expect(m.boardCardOwner.createMany).toHaveBeenCalledWith({
      data: [
        { cardId: "c1", personId: "p1", rawName: "Sam" },
        { cardId: "c1", personId: "p2", rawName: null },
      ],
      skipDuplicates: true,
    });
    expect(m.boardCard.update.mock.calls[1][0].data).toMatchObject({ ownerId: "p1", rawOwnerName: "Sam" });
    expect((await res.json()).ownerIds).toEqual(["p1", "p2"]);
  });

  it("accepts the legacy ownerId body", async () => {
    m.boardCard.findUnique.mockResolvedValue(baseCard());
    const res = await patch({ ownerId: "p2" });
    expect(res.status).toBe(200);
    expect(m.boardCardOwner.deleteMany).toHaveBeenCalledWith({ where: { cardId: "c1", personId: { notIn: ["p2"] } } });
  });

  it("400s on an unknown owner and on both fields", async () => {
    m.boardCard.findUnique.mockResolvedValue(baseCard());
    expect((await patch({ ownerIds: ["ghost"] })).status).toBe(400);
    expect((await patch({ ownerIds: ["p1"], ownerId: "p1" })).status).toBe(400);
    expect(m.boardCard.update).not.toHaveBeenCalled();
  });

  it("audit metadata carries person ids only", async () => {
    m.boardCard.findUnique.mockResolvedValue(
      baseCard({ owners: [{ personId: "p1", rawName: null }, { personId: "p3", rawName: null }] })
    );
    await patch({ ownerIds: ["p1", "p2"] });
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN,
      "BOARD_CARD_UPDATED",
      expect.objectContaining({
        metadata: expect.objectContaining({ ownersAdded: ["p2"], ownersRemoved: ["p3"], fields: expect.arrayContaining(["owners"]) }),
      })
    );
    const meta = JSON.stringify(vi.mocked(logAdminAction).mock.calls[0][2]);
    expect(meta).not.toMatch(/Sam|Jane/);
  });

  it("a title-only PATCH leaves owners alone", async () => {
    m.boardCard.findUnique.mockResolvedValue(baseCard());
    const res = await patch({ title: "New title" });
    expect(res.status).toBe(200);
    expect(m.boardCardOwner.deleteMany).not.toHaveBeenCalled();
  });

  it("404s on an unknown card", async () => {
    m.boardCard.findUnique.mockResolvedValue(null);
    expect((await patch({ ownerIds: [] })).status).toBe(404);
  });
});
