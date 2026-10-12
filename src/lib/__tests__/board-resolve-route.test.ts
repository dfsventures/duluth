import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 38 (WS114, F118): POST /api/admin/board/cards/[id]/resolve with
// per-name owner resolution, ignore, aliases, propagation and the cap.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const m = vi.hoisted(() => ({
  boardPerson: { count: vi.fn(), create: vi.fn() },
  boardProject: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  boardAlias: { createMany: vi.fn() },
  boardCard: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  boardCardOwner: { deleteMany: vi.fn(), createMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  db: { ...m, $transaction: (fn: (t: typeof m) => unknown) => fn(m) },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { POST } from "@/app/api/admin/board/cards/[id]/resolve/route";

const ADMIN = { id: "a1", email: "admin@example.com", roles: ["ADMIN"] };

const call = (body: unknown) =>
  POST(
    new Request("https://molly.dfs.vc/api/admin/board/cards/c1/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "c1" }) }
  );

function target(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    projectId: null,
    rawProjectName: null,
    unmatchedOwnerNames: ["Jane F", "Sam P"],
    owners: [],
    ...over,
  };
}

/** update calls for one card id, in order */
const updatesFor = (id: string) => m.boardCard.update.mock.calls.filter((c) => c[0].where.id === id).map((c) => c[0].data);

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, error: null } as never);
  vi.mocked(logAdminAction).mockReset();
  for (const g of Object.values(m)) Object.values(g).forEach((f) => f.mockReset());
  m.boardPerson.count.mockImplementation(async ({ where }: any) => where.id.in.filter((x: string) => x !== "ghost").length);
  let n = 0;
  m.boardPerson.create.mockImplementation(async ({ data }: any) => ({ id: `new${++n}`, ...data }));
  m.boardProject.findUnique.mockResolvedValue({ id: "j1" });
  m.boardProject.findMany.mockResolvedValue([]);
  m.boardAlias.createMany.mockImplementation(async ({ data }: any) => ({ count: data.length }));
  m.boardCard.findUnique.mockResolvedValue(target());
  m.boardCard.findMany.mockResolvedValue([]);
  m.boardCard.update.mockImplementation(async ({ data }: any) => ({ id: "c1", ...data }));
});

describe("POST /api/admin/board/cards/[id]/resolve", () => {
  it("resolves two unmatched names in one call", async () => {
    const res = await call({
      owners: [
        { raw: "Jane F", personId: "p1" },
        { raw: "Sam P", personId: "p2" },
      ],
    });
    expect(res.status).toBe(200);
    expect(m.boardCardOwner.createMany).toHaveBeenCalledWith({
      data: [
        { cardId: "c1", personId: "p1", rawName: "Jane F" },
        { cardId: "c1", personId: "p2", rawName: "Sam P" },
      ],
      skipDuplicates: true,
    });
    const ups = updatesFor("c1");
    expect(ups[0]).toMatchObject({ ownerId: "p1", rawOwnerName: "Jane F", unmatchedOwnerNames: [] });
    const last = ups[ups.length - 1];
    expect(last.needsReview).toBe(false);
    expect(last.humanEditedAt).toBeInstanceOf(Date);
    expect((await res.json()).fixed).toBe(0);
  });

  it("creates a new person for newPerson, audited", async () => {
    const res = await call({ owners: [{ raw: "Jane F", newPerson: true }, { raw: "Sam P", personId: "p2" }] });
    expect(res.status).toBe(200);
    expect(m.boardPerson.create).toHaveBeenCalledWith({ data: { displayName: "Jane F" } });
    expect(logAdminAction).toHaveBeenCalledWith(ADMIN, "BOARD_PERSON_CREATED", expect.objectContaining({ targetId: "new1" }));
  });

  it("remembers one alias per non-ignored name; an ignored name is dropped, never aliased", async () => {
    const res = await call({
      owners: [
        { raw: "Jane F", personId: "p1" },
        { raw: "Sam P", ignore: true },
      ],
      rememberAlias: true,
    });
    expect(res.status).toBe(200);
    const rows = m.boardAlias.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "PERSON", personId: "p1" });
    expect(m.boardCardOwner.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(updatesFor("c1")[0].unmatchedOwnerNames).toEqual([]);
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN,
      "BOARD_CARD_UPDATED",
      expect.objectContaining({ metadata: expect.objectContaining({ ignored: 1, ownerIds: ["p1"] }) })
    );
  });

  it("creates one alias per name when two are resolved", async () => {
    await call({
      owners: [
        { raw: "Jane F", personId: "p1" },
        { raw: "Sam P", personId: "p2" },
      ],
      rememberAlias: true,
    });
    expect(m.boardAlias.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it("propagates to another card carrying the same normalized name, leaving other names flagged", async () => {
    m.boardCard.findMany.mockResolvedValue([
      { id: "c2", unmatchedOwnerNames: ["jane  f.", "Other Person"], rawProjectName: null, projectId: null, owners: [] },
    ]);
    const res = await call({ owners: [{ raw: "Jane F", personId: "p1" }, { raw: "Sam P", ignore: true }] });
    expect((await res.json()).fixed).toBe(1);
    const ups = updatesFor("c2");
    expect(ups[0]).toMatchObject({ ownerId: "p1", unmatchedOwnerNames: ["Other Person"] });
    expect(ups[ups.length - 1].needsReview).toBe(true); // "Other Person" still waits
    // only the target gets humanEditedAt
    expect(ups.some((u) => "humanEditedAt" in u)).toBe(false);
    // ignored name does not propagate
    expect(m.boardCard.findMany.mock.calls[0][0].where.id).toEqual({ not: "c1" });
  });

  it("does not propagate an ignored name", async () => {
    m.boardCard.findMany.mockResolvedValue([
      { id: "c2", unmatchedOwnerNames: ["Sam P"], rawProjectName: null, projectId: null, owners: [] },
    ]);
    const res = await call({ owners: [{ raw: "Jane F", personId: "p1" }, { raw: "Sam P", ignore: true }] });
    expect((await res.json()).fixed).toBe(0);
    expect(updatesFor("c2")).toHaveLength(0);
  });

  it("a card that would end up over the cap keeps its name and stays flagged", async () => {
    m.boardCard.findMany.mockResolvedValue([
      {
        id: "c2",
        unmatchedOwnerNames: ["Jane F", "Extra"],
        rawProjectName: null,
        projectId: null,
        owners: ["a", "b", "c", "d"].map((personId) => ({ personId, rawName: null })), // 4 + 2 > 5
      },
    ]);
    const res = await call({ owners: [{ raw: "Jane F", personId: "p1" }, { raw: "Sam P", ignore: true }] });
    expect((await res.json()).fixed).toBe(0);
    expect(updatesFor("c2")).toHaveLength(0);
  });

  it("F117: resolving an owner does not re-flag a card whose project matched via alias", async () => {
    m.boardCard.findUnique.mockResolvedValue(
      target({ unmatchedOwnerNames: ["Jane F"], rawProjectName: "AcmeHQ", projectId: "j1" })
    );
    await call({ owners: [{ raw: "Jane F", personId: "p1" }] });
    const ups = updatesFor("c1");
    expect(ups[ups.length - 1].needsReview).toBe(false);
  });

  it("propagates the project to cards with the same raw project and no projectId", async () => {
    m.boardCard.findUnique.mockResolvedValue(target({ unmatchedOwnerNames: [], rawProjectName: "Acme onboarding" }));
    m.boardCard.findMany.mockResolvedValue([
      { id: "c2", unmatchedOwnerNames: [], rawProjectName: "acme onboarding", projectId: null, owners: [] },
    ]);
    const res = await call({ projectId: "j1", rememberAlias: true });
    expect((await res.json()).fixed).toBe(1);
    expect(updatesFor("c2")[0]).toMatchObject({ projectId: "j1", rawProjectName: null, needsReview: false });
    expect(m.boardAlias.createMany.mock.calls[0][0].data[0]).toMatchObject({ kind: "PROJECT", projectId: "j1" });
  });

  it("accepts the legacy { ownerId } body, resolving the first unmatched name", async () => {
    m.boardCard.findUnique.mockResolvedValue(target({ unmatchedOwnerNames: ["Jane F"] }));
    const res = await call({ ownerId: "p1" });
    expect(res.status).toBe(200);
    expect(m.boardCardOwner.createMany.mock.calls[0][0].data).toEqual([{ cardId: "c1", personId: "p1", rawName: "Jane F" }]);
  });

  it("accepts the legacy { newPersonName } body", async () => {
    m.boardCard.findUnique.mockResolvedValue(target({ unmatchedOwnerNames: ["Jane F"] }));
    const res = await call({ newPersonName: "Jane Founder" });
    expect(res.status).toBe(200);
    expect(m.boardPerson.create).toHaveBeenCalledWith({ data: { displayName: "Jane Founder" } });
  });

  it("400s when a raw name is not waiting on the card", async () => {
    const res = await call({ owners: [{ raw: "Nobody", personId: "p1" }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/isn't waiting/);
    expect(m.boardCard.update).not.toHaveBeenCalled();
  });

  it("400s on an entry without exactly one choice, an unknown person, and an empty body", async () => {
    expect((await call({ owners: [{ raw: "Jane F" }] })).status).toBe(400);
    expect((await call({ owners: [{ raw: "Jane F", personId: "p1", ignore: true }] })).status).toBe(400);
    expect((await call({ owners: [{ raw: "Jane F", personId: "ghost" }] })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect(m.boardCard.update).not.toHaveBeenCalled();
  });

  it("400s before any write when the result would exceed the cap", async () => {
    m.boardCard.findUnique.mockResolvedValue(
      target({
        unmatchedOwnerNames: ["Jane F", "Extra"],
        owners: ["a", "b", "c", "d"].map((personId) => ({ personId, rawName: null })),
      })
    );
    const res = await call({ owners: [{ raw: "Jane F", personId: "p1" }, { raw: "Extra", personId: "p2" }] });
    expect(res.status).toBe(400);
    expect(m.boardCard.update).not.toHaveBeenCalled();
  });

  it("404s on an unknown card", async () => {
    m.boardCard.findUnique.mockResolvedValue(null);
    expect((await call({ projectId: "j1" })).status).toBe(404);
  });
});
