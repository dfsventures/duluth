import { describe, it, expect, vi, beforeEach } from "vitest";

// Hard delete of plain-name board people and board projects.
// The cascade / SetNull behaviour is declared in prisma/schema.prisma; here an
// in-memory stand-in applies the same rules so the route's contract is tested.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

type P = { id: string; displayName: string; userId: string | null };
const state = {
  people: [] as P[],
  projects: [] as { id: string; name: string }[],
  cards: [] as { id: string; ownerId: string | null; projectId: string | null }[],
  aliases: [] as { id: string; personId: string | null; projectId: string | null }[],
};

vi.mock("@/lib/db", () => ({
  db: {
    boardPerson: {
      findUnique: vi.fn(async ({ where }: any) => {
        const p = state.people.find((x) => x.id === where.id);
        return p ? { ...p, _count: { cards: state.cards.filter((c) => c.ownerId === p.id).length } } : null;
      }),
      delete: vi.fn(async ({ where }: any) => {
        state.people = state.people.filter((x) => x.id !== where.id);
        state.cards.forEach((c) => c.ownerId === where.id && (c.ownerId = null));
        state.aliases = state.aliases.filter((a) => a.personId !== where.id);
      }),
    },
    boardProject: {
      findUnique: vi.fn(async ({ where }: any) => {
        const p = state.projects.find((x) => x.id === where.id);
        return p ? { ...p, _count: { cards: state.cards.filter((c) => c.projectId === p.id).length } } : null;
      }),
      delete: vi.fn(async ({ where }: any) => {
        state.projects = state.projects.filter((x) => x.id !== where.id);
        state.cards.forEach((c) => c.projectId === where.id && (c.projectId = null));
        state.aliases = state.aliases.filter((a) => a.projectId !== where.id);
      }),
    },
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { DELETE as deletePerson } from "@/app/api/admin/board/people/[id]/route";
import { DELETE as deleteProject } from "@/app/api/admin/board/projects/[id]/route";

const ADMIN = { id: "a1", email: "admin@example.com", roles: ["ADMIN"] };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("https://molly.dfs.vc/api/admin/board/x", { method: "DELETE" });

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, error: null } as never);
  vi.mocked(logAdminAction).mockReset();
  state.people = [
    { id: "p1", displayName: "Sam Partner", userId: null },
    { id: "p2", displayName: "Admin Person", userId: "u1" },
  ];
  state.projects = [{ id: "j1", name: "Project Atlas" }];
  state.cards = [
    { id: "c1", ownerId: "p1", projectId: "j1" },
    { id: "c2", ownerId: "p1", projectId: null },
    { id: "c3", ownerId: "p2", projectId: "j1" },
  ];
  state.aliases = [
    { id: "a1", personId: "p1", projectId: null },
    { id: "a2", personId: null, projectId: "j1" },
  ];
});

describe("DELETE /api/admin/board/people/[id]", () => {
  it("deletes a plain person, unassigns their cards, drops aliases, audits", async () => {
    const res = await deletePerson(req(), ctx("p1"));
    expect(res.status).toBe(200);
    expect((await res.json()).affectedCards).toBe(2);
    expect(state.people.find((p) => p.id === "p1")).toBeUndefined();
    expect(state.cards.filter((c) => c.ownerId === "p1")).toHaveLength(0);
    expect(state.cards).toHaveLength(3);
    expect(state.aliases.find((a) => a.personId === "p1")).toBeUndefined();
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN,
      "BOARD_PERSON_DELETED",
      expect.objectContaining({ metadata: { name: "Sam Partner", affectedCards: 2 } })
    );
  });

  it("refuses a person linked to a Molly admin", async () => {
    const res = await deletePerson(req(), ctx("p2"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Archive/);
    expect(state.people).toHaveLength(2);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("404s on an unknown id", async () => {
    expect((await deletePerson(req(), ctx("nope"))).status).toBe(404);
  });

  it("returns the guard's response when not an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, error: new Response(null, { status: 403 }) } as never);
    const res = await deletePerson(req(), ctx("p1"));
    expect(res.status).toBe(403);
    expect(state.people).toHaveLength(2);
  });
});

describe("DELETE /api/admin/board/projects/[id]", () => {
  it("deletes a project, cards lose the project, aliases go, audits", async () => {
    const res = await deleteProject(req(), ctx("j1"));
    expect(res.status).toBe(200);
    expect((await res.json()).affectedCards).toBe(2);
    expect(state.projects).toHaveLength(0);
    expect(state.cards).toHaveLength(3);
    expect(state.cards.every((c) => c.projectId === null)).toBe(true);
    expect(state.aliases.find((a) => a.projectId === "j1")).toBeUndefined();
    expect(logAdminAction).toHaveBeenCalledWith(
      ADMIN,
      "BOARD_PROJECT_DELETED",
      expect.objectContaining({ metadata: { name: "Project Atlas", affectedCards: 2 } })
    );
  });

  it("404s on an unknown id", async () => {
    expect((await deleteProject(req(), ctx("nope"))).status).toBe(404);
  });

  it("returns the guard's response when not an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, error: new Response(null, { status: 401 }) } as never);
    expect((await deleteProject(req(), ctx("j1"))).status).toBe(401);
    expect(state.projects).toHaveLength(1);
  });
});
