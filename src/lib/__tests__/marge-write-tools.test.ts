import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 39 (WS122): the Marge write tools. A dry run reads only; an apply goes through the WS119
// functions with an allowlisted body and the `via` marker.

const WRITE_METHODS = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"] as const;
const m = vi.hoisted(() => {
  const w = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];
  const mk = (reads: string[]) => Object.fromEntries([...reads, ...w].map((k) => [k, vi.fn()]));
  return {
    boardCard: mk(["findMany", "findUnique"]),
    boardPerson: mk(["findMany", "findUnique"]),
    boardProject: mk(["findMany", "findUnique"]),
    boardAlias: mk(["findMany"]),
    boardCardLink: mk(["count"]),
    boardCardOwner: mk([]),
    companyBroadcast: mk(["findUnique"]),
    companyBroadcastTarget: mk([]),
    portfolioCompany: mk(["findMany"]),
    user: mk(["findMany"]),
    auditLog: mk([]),
    $transaction: vi.fn(),
  };
});
vi.mock("@/lib/db", () => ({ db: m }));

const actions = vi.hoisted(() => ({
  createBoardCard: vi.fn(),
  updateBoardCard: vi.fn(),
  moveBoardCard: vi.fn(),
  addBoardCardLink: vi.fn(),
}));
vi.mock("@/lib/board-actions", () => actions);
const drafts = vi.hoisted(() => ({ createBroadcastDraft: vi.fn(), updateBroadcastDraft: vi.fn() }));
vi.mock("@/lib/broadcast-drafts", () => drafts);

import * as w from "@/lib/marge-tools/write";
import { ToolError } from "@/lib/marge-tools/types";
import { resolveOne } from "@/lib/marge-tools/resolve";

const P = { id: "u1", email: "admin@example.com", name: "Sam Partner" };
const VIA = { via: "marge" as const, margeActionId: "act1" };
const DRY = { dryRun: true };
const APPLY = { dryRun: false, via: VIA };
const UPDATED = new Date("2026-10-15T10:00:00.000Z");
const FRESH = UPDATED.toISOString();

function assertNoWrites() {
  for (const [name, mod] of Object.entries(m)) {
    if (typeof mod !== "object") continue;
    for (const k of WRITE_METHODS) {
      expect(mod[k]?.mock.calls.length ?? 0, `${name}.${k}`).toBe(0);
    }
  }
  expect(m.$transaction).not.toHaveBeenCalled();
  for (const f of Object.values(actions)) expect(f).not.toHaveBeenCalled();
  for (const f of Object.values(drafts)) expect(f).not.toHaveBeenCalled();
}

const cardRow = (over: Record<string, unknown> = {}) => ({
  id: "k1", title: "Send deck", notes: null, status: "TODO", dueDate: null, updatedAt: UPDATED, archivedAt: null,
  projectId: null, project: null, owners: [], _count: { links: 0 }, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.boardPerson.findMany.mockResolvedValue([
    { id: "bp1", displayName: "Sam Partner", user: { name: "Sam Partner", email: "admin@example.com" } },
    { id: "bp2", displayName: "Sam Analyst", user: null },
    { id: "bp3", displayName: "Jane Founder", user: null },
  ]);
  m.boardProject.findMany.mockResolvedValue([{ id: "pr1", name: "AcmeHQ onboarding" }]);
  m.boardAlias.findMany.mockResolvedValue([]);
  m.boardCard.findMany.mockResolvedValue([]);
  m.user.findMany.mockResolvedValue([]);
  m.boardPerson.findUnique.mockResolvedValue({ id: "bp1", displayName: "Sam Partner", user: { name: "Sam Partner" } });
  m.boardCard.findUnique.mockResolvedValue(cardRow());
  m.portfolioCompany.findMany.mockResolvedValue([{ id: "pc1", name: "Acme" }, { id: "pc2", name: "Beta Co" }]);
  m.companyBroadcast.findUnique.mockResolvedValue({
    id: "b1", subject: "Hello", body: "<p>Old body here</p>", status: "DRAFT", updatedAt: UPDATED,
    targets: [{ portfolioCompany: { name: "Acme" } }],
  });
  actions.createBoardCard.mockResolvedValue({ ok: true, value: { id: "k9", title: "Send deck" } });
  actions.updateBoardCard.mockResolvedValue({ ok: true, value: { id: "k1", title: "New" } });
  actions.moveBoardCard.mockResolvedValue({ ok: true, value: { id: "k1" } });
  actions.addBoardCardLink.mockResolvedValue({ ok: true, value: { id: "l1" } });
  drafts.createBroadcastDraft.mockResolvedValue({ ok: true, value: { id: "b9", subject: "Hi" } });
  drafts.updateBroadcastDraft.mockResolvedValue({ ok: true, value: { id: "b1", subject: "Hello" } });
});

const parse = <T,>(schema: { parse: (v: unknown) => T }, v: unknown) => schema.parse(v);

describe("dry runs never write", () => {
  it("all five tools, including owner 'me'", async () => {
    await w.boardCardCreate(parse(w.boardCardCreateInput, { title: "Send deck", owners: ["me", "Jane Founder"], project: "AcmeHQ onboarding", dueDate: "2026-10-23" }), P, DRY);
    await w.boardCardUpdate(parse(w.boardCardUpdateInput, { cardId: "k1", expectedUpdatedAt: FRESH, title: "New", owners: ["me"] }), P, DRY);
    await w.boardCardMove(parse(w.boardCardMoveInput, { cardId: "k1", expectedUpdatedAt: FRESH, status: "DONE" }), P, DRY);
    await w.boardCardAddLink(parse(w.boardCardAddLinkInput, { cardId: "k1", url: "https://example.com/deck" }), P, DRY);
    await w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { subject: "Hi", bodyText: "Hello", companies: ["Acme"] }), P, DRY);
    await w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { broadcastId: "b1", expectedUpdatedAt: FRESH, bodyText: "New" }), P, DRY);
    assertNoWrites();
  });

  it("'me' without a board profile resolves read-only: no ensureAdminPeople upsert on a dry run", async () => {
    m.boardPerson.findUnique.mockResolvedValue(null);
    m.user.findMany.mockResolvedValue([{ id: "u1", name: "Sam Partner", email: "admin@example.com" }]); // would trigger an upsert
    const out = await w.boardCardCreate(parse(w.boardCardCreateInput, { title: "T", owners: ["me"] }), P, DRY);
    expect(out.text).toContain("Owners: Sam Partner");
    assertNoWrites();
  });

  it("dryRun defaults to true in every schema", () => {
    expect(w.boardCardCreateInput.parse({ title: "x" }).dryRun).toBe(true);
    expect(w.boardCardUpdateInput.parse({ cardId: "a", expectedUpdatedAt: "b" }).dryRun).toBe(true);
    expect(w.boardCardMoveInput.parse({ cardId: "a", expectedUpdatedAt: "b", status: "DONE" }).dryRun).toBe(true);
    expect(w.boardCardAddLinkInput.parse({ cardId: "a", url: "u" }).dryRun).toBe(true);
    expect(w.broadcastDraftSaveInput.parse({}).dryRun).toBe(true);
  });
});

describe("board_card_create", () => {
  it("preview shows resolved names; apply passes an allowlisted body of ids with via", async () => {
    const input = parse(w.boardCardCreateInput, {
      title: "  Send deck ", notes: "n", status: "IN_PROGRESS", owners: ["me", "Jane Founder", "Sam Partner"],
      project: "acmehq onboarding", dueDate: "2026-10-23", dryRun: false, junk: "x", archived: true,
    });
    const pv = await w.boardCardCreate(input, P, DRY);
    expect(pv.text).toContain("Owners: Sam Partner, Jane Founder");
    expect(pv.text).toContain("Due: Fri 23 Oct 2026 (2026-10-23)");
    expect(pv.text).toContain("Status: In progress");

    const out = await w.boardCardCreate(input, P, APPLY);
    expect(actions.createBoardCard).toHaveBeenCalledWith(
      P,
      { title: "Send deck", notes: "n", status: "IN_PROGRESS", ownerIds: ["bp1", "bp3"], projectId: "pr1", dueDate: "2026-10-23" },
      VIA
    );
    expect(out.structured).toEqual({ cardId: "k9", url: expect.stringContaining("/admin/board") });
  });

  it("rejects a 301-character title, > 5 owners and unknown / ambiguous names", async () => {
    await expect(w.boardCardCreate(parse(w.boardCardCreateInput, { title: "x".repeat(301) }), P, DRY)).rejects.toThrow(/1-300/);
    expect(() => w.boardCardCreateInput.parse({ title: "x", owners: ["a", "b", "c", "d", "e", "f"] })).toThrow();
    await expect(w.boardCardCreate({ title: "x", owners: ["a", "b", "c", "d", "e", "f"], dryRun: true }, P, DRY)).rejects.toThrow(/at most 5 owners/);
    await expect(w.boardCardCreate(parse(w.boardCardCreateInput, { title: "x", owners: ["Sam"] }), P, DRY)).rejects.toThrow(/No person called “Sam”/);
    m.boardPerson.findMany.mockResolvedValue([
      { id: "a", displayName: "Sam Partner", user: null },
      { id: "b", displayName: "Sam Partner", user: null },
    ]);
    await expect(w.boardCardCreate(parse(w.boardCardCreateInput, { title: "x", owners: ["Sam Partner"] }), P, DRY)).rejects.toThrow(/matches 2 people: Sam Partner, Sam Partner\. Use the full name\./);
    await expect(w.boardCardCreate(parse(w.boardCardCreateInput, { title: "x", project: "Nope" }), P, DRY)).rejects.toThrow(/No project called “Nope”\. Known: AcmeHQ onboarding/);
    assertNoWrites();
  });

  it("never creates a person or project for an unknown name", async () => {
    await expect(w.boardCardCreate(parse(w.boardCardCreateInput, { title: "x", owners: ["Zed"] }), P, APPLY)).rejects.toThrow(ToolError);
    expect(m.boardPerson.create).not.toHaveBeenCalled();
    expect(m.boardProject.create).not.toHaveBeenCalled();
    expect(actions.createBoardCard).not.toHaveBeenCalled();
  });

  it("an apply without via is refused loudly", async () => {
    await expect(w.boardCardCreate(parse(w.boardCardCreateInput, { title: "x" }), P, { dryRun: false })).rejects.toThrow("apply without via");
  });

  it("surfaces the shared function's validation message", async () => {
    actions.createBoardCard.mockResolvedValue({ ok: false, status: 400, error: "Invalid notes" });
    await expect(w.boardCardCreate(parse(w.boardCardCreateInput, { title: "x" }), P, APPLY)).rejects.toThrow("Invalid notes");
  });
});

describe("board_card_update", () => {
  it("only provided keys reach the shared function; status and archived never do", async () => {
    const input = parse(w.boardCardUpdateInput, {
      cardId: "k1", expectedUpdatedAt: FRESH, title: "New", notes: null, dueDate: null, project: null, owners: ["Jane Founder"],
      dryRun: false, archived: true, status: "DONE",
    });
    await w.boardCardUpdate(input, P, APPLY);
    expect(actions.updateBoardCard).toHaveBeenCalledWith(
      P, "k1", { title: "New", notes: null, dueDate: null, projectId: null, ownerIds: ["bp3"] }, VIA
    );
    const body = actions.updateBoardCard.mock.calls[0][2];
    expect(body).not.toHaveProperty("archived");
    expect(body).not.toHaveProperty("status");
  });

  it("preview is before to after, echoes expectedUpdatedAt", async () => {
    m.boardCard.findUnique.mockResolvedValue(cardRow({ title: "Old", project: { name: "AcmeHQ onboarding" }, owners: [{ personId: "bp3", person: { displayName: "Jane Founder", user: null } }] }));
    const out = await w.boardCardUpdate(parse(w.boardCardUpdateInput, { cardId: "k1", expectedUpdatedAt: FRESH, title: "New", owners: ["me"] }), P, DRY);
    expect(out.text).toContain("Title: Old → New");
    expect(out.text).toContain("Owners: Jane Founder → Sam Partner");
    expect((out.structured.preview as { expectedUpdatedAt: string }).expectedUpdatedAt).toBe(FRESH);
  });

  it("freshness: a changed card is refused at plan time and again at apply time", async () => {
    const stale = parse(w.boardCardUpdateInput, { cardId: "k1", expectedUpdatedAt: "2026-10-01T00:00:00.000Z", title: "New" });
    await expect(w.boardCardUpdate(stale, P, DRY)).rejects.toMatchObject({ message: "This card changed since I showed it to you. Ask me again.", code: "conflict" });
    await expect(w.boardCardUpdate({ ...stale, dryRun: false }, P, APPLY)).rejects.toThrow(/changed since/);
    expect(actions.updateBoardCard).not.toHaveBeenCalled();
    // The card changes between preview and apply:
    const ok = parse(w.boardCardUpdateInput, { cardId: "k1", expectedUpdatedAt: FRESH, title: "New", dryRun: false });
    m.boardCard.findUnique.mockResolvedValue(cardRow({ updatedAt: new Date("2026-10-16T09:00:00.000Z") }));
    await expect(w.boardCardUpdate(ok, P, APPLY)).rejects.toThrow(/changed since/);
    expect(actions.updateBoardCard).not.toHaveBeenCalled();
  });

  it("a 409 from the shared function reads as the stale message; missing / archived card; nothing to change", async () => {
    actions.updateBoardCard.mockResolvedValue({ ok: false, status: 409, error: "x" });
    await expect(w.boardCardUpdate(parse(w.boardCardUpdateInput, { cardId: "k1", expectedUpdatedAt: FRESH, title: "N", dryRun: false }), P, APPLY)).rejects.toThrow(/changed since/);
    m.boardCard.findUnique.mockResolvedValue(null);
    await expect(w.boardCardUpdate(parse(w.boardCardUpdateInput, { cardId: "zz", expectedUpdatedAt: FRESH, title: "N" }), P, DRY)).rejects.toThrow("No card with that id.");
    m.boardCard.findUnique.mockResolvedValue(cardRow({ archivedAt: new Date() }));
    await expect(w.boardCardUpdate(parse(w.boardCardUpdateInput, { cardId: "k1", expectedUpdatedAt: FRESH, title: "N" }), P, DRY)).rejects.toThrow("No card with that id.");
    m.boardCard.findUnique.mockResolvedValue(cardRow());
    await expect(w.boardCardUpdate(parse(w.boardCardUpdateInput, { cardId: "k1", expectedUpdatedAt: FRESH }), P, DRY)).rejects.toThrow(/Nothing to change/);
  });
});

describe("board_card_move", () => {
  it("preview 'To do → Done' with the no-proof-link nudge; apply sends only status", async () => {
    const input = parse(w.boardCardMoveInput, { cardId: "k1", expectedUpdatedAt: FRESH, status: "DONE", dryRun: false });
    const pv = await w.boardCardMove({ ...input, dryRun: true }, P, DRY);
    expect(pv.text).toContain("Status: To do → Done");
    expect((pv.structured.preview as { warnings: string[] }).warnings).toEqual(["No proof link yet."]);
    await w.boardCardMove(input, P, APPLY);
    expect(actions.moveBoardCard).toHaveBeenCalledWith(P, "k1", { status: "DONE" }, VIA);
  });

  it("no nudge when the card has a link or the target is not Done; freshness; same-column refusal", async () => {
    m.boardCard.findUnique.mockResolvedValue(cardRow({ _count: { links: 1 } }));
    const a = await w.boardCardMove(parse(w.boardCardMoveInput, { cardId: "k1", expectedUpdatedAt: FRESH, status: "DONE" }), P, DRY);
    expect((a.structured.preview as { warnings: string[] }).warnings).toEqual([]);
    await expect(w.boardCardMove(parse(w.boardCardMoveInput, { cardId: "k1", expectedUpdatedAt: "nope", status: "DONE" }), P, DRY)).rejects.toThrow(/changed since/);
    await expect(w.boardCardMove(parse(w.boardCardMoveInput, { cardId: "k1", expectedUpdatedAt: FRESH, status: "TODO" }), P, DRY)).rejects.toThrow(/already in To do/);
    expect(() => w.boardCardMoveInput.parse({ cardId: "k1", expectedUpdatedAt: FRESH, status: "ARCHIVED" })).toThrow();
  });
});

describe("board_card_add_link", () => {
  it("validates the URL and the 10-link cap at plan time and again at apply", async () => {
    await expect(w.boardCardAddLink(parse(w.boardCardAddLinkInput, { cardId: "k1", url: "javascript:alert(1)" }), P, DRY)).rejects.toThrow(/valid http\(s\) link/);
    m.boardCard.findUnique.mockResolvedValue(cardRow({ _count: { links: 10 } }));
    await expect(w.boardCardAddLink(parse(w.boardCardAddLinkInput, { cardId: "k1", url: "https://example.com/a" }), P, DRY)).rejects.toThrow(/at most 10 links/);
    await expect(w.boardCardAddLink(parse(w.boardCardAddLinkInput, { cardId: "k1", url: "https://example.com/a", dryRun: false }), P, APPLY)).rejects.toThrow(/at most 10 links/);
    expect(actions.addBoardCardLink).not.toHaveBeenCalled();
  });

  it("preview shows host and label; apply passes the normalised url and label with via", async () => {
    const input = parse(w.boardCardAddLinkInput, { cardId: "k1", url: "https://www.example.com/deck", label: " Deck ", dryRun: false });
    const pv = await w.boardCardAddLink({ ...input, dryRun: true }, P, DRY);
    expect(pv.text).toContain("Link: Deck (example.com)");
    const out = await w.boardCardAddLink(input, P, APPLY);
    expect(actions.addBoardCardLink).toHaveBeenCalledWith(P, "k1", { url: "https://www.example.com/deck", label: "Deck" }, VIA);
    expect(out.structured.linkId).toBe("l1");
  });
});

describe("broadcast_draft_save", () => {
  it("create: subject required; companies resolved to ids; body converted from plain text (HTML stored escaped)", async () => {
    await expect(w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { bodyText: "x" }), P, DRY)).rejects.toThrow(/subject is required/i);
    const input = parse(w.broadcastDraftSaveInput, {
      subject: " Hi ", bodyText: "Line one <script>alert(1)</script>\n\nSecond & last", companies: ["acme", "Beta Co", "Acme"], dryRun: false,
    });
    const pv = await w.broadcastDraftSave({ ...input, dryRun: true }, P, DRY);
    expect(pv.text).toContain("Audience: 2 companies: Acme, Beta Co");
    expect(pv.text).toContain("Draft only. Nothing is sent until someone publishes it in Molly.");
    await w.broadcastDraftSave(input, P, APPLY);
    const [, arg, via] = drafts.createBroadcastDraft.mock.calls[0];
    expect(arg.subject).toBe("Hi");
    expect(arg.portfolioCompanyIds).toEqual(["pc1", "pc2"]);
    expect(arg.body).toBe("<p>Line one &lt;script&gt;alert(1)&lt;/script&gt;</p><p>Second &amp; last</p>");
    expect(arg.body).not.toContain("<script>");
    expect(via).toBe(VIA);
  });

  it("edit: requires expectedUpdatedAt; only DRAFTs; freshness; only provided keys", async () => {
    await expect(w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { broadcastId: "b1", subject: "X" }), P, DRY)).rejects.toThrow(/expectedUpdatedAt is required/);
    m.companyBroadcast.findUnique.mockResolvedValueOnce({ id: "b1", subject: "S", body: "", status: "PUBLISHED", updatedAt: UPDATED, targets: [] });
    await expect(w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { broadcastId: "b1", expectedUpdatedAt: FRESH, subject: "X" }), P, DRY)).rejects.toThrow("That broadcast is already published; edit a draft instead.");
    await expect(w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { broadcastId: "b1", expectedUpdatedAt: "2026-01-01T00:00:00.000Z", subject: "X" }), P, DRY)).rejects.toThrow(/draft changed/);
    await w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { broadcastId: "b1", expectedUpdatedAt: FRESH, subject: "X", dryRun: false }), P, APPLY);
    expect(drafts.updateBroadcastDraft).toHaveBeenCalledWith(P, "b1", { subject: "X" }, VIA);
  });

  it("replacing a body warns with the current length and the lost formatting (Q111)", async () => {
    const pv = await w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { broadcastId: "b1", expectedUpdatedAt: FRESH, bodyText: "New text" }), P, DRY);
    const preview = pv.structured.preview as { warnings: string[]; expectedUpdatedAt: string };
    expect(preview.warnings[0]).toBe("Replaces the current body (13 characters). Formatting from the Molly editor is lost.");
    expect(preview.expectedUpdatedAt).toBe(FRESH);
  });

  it("an unknown company is an error with known names; subject length", async () => {
    await expect(w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { subject: "S", companies: ["Zed"] }), P, DRY)).rejects.toThrow(/No company called “Zed”\. Known: Acme, Beta Co/);
    await expect(w.broadcastDraftSave(parse(w.broadcastDraftSaveInput, { subject: "x".repeat(201) }), P, DRY)).rejects.toThrow(/200 characters/);
    expect(() => w.broadcastDraftSaveInput.parse({ bodyText: "x".repeat(10_001) })).toThrow();
    expect(() => w.broadcastDraftSaveInput.parse({ companies: Array(51).fill("a") })).toThrow();
  });
});

describe("resolveOne", () => {
  const list = [
    { id: "1", name: "Sam Partner", aliases: ["sammy"] },
    { id: "2", name: "Sam Analyst", aliases: ["sammy"] },
    { id: "3", name: "Jane Founder", aliases: [] },
  ];
  it("exact name, then alias; ambiguity at the winning step refuses", () => {
    expect(resolveOne("jane  founder", list, "person")).toEqual({ ok: true, id: "3", name: "Jane Founder" });
    expect(resolveOne("Sam Partner", list, "person")).toMatchObject({ ok: true, id: "1" });
    expect(resolveOne("sammy", list, "person")).toEqual({ ok: false, error: "“sammy” matches 2 people: Sam Partner, Sam Analyst. Use the full name." });
  });
  it("unknown lists up to 8 known names", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `P${i}`, aliases: [] }));
    const r = resolveOne("zz", many, "person");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("No person called “zz”. Known: P0, P1, P2, P3, P4, P5, P6, P7, ….");
  });
});
