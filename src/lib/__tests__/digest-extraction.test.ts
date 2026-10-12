import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 37, WS108.1 — shared digest extraction: prompt content, zod validation,
// one retry on malformed JSON, unknown ids nulled.

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...a: unknown[]) => mockCreate(...a) };
  },
}));
vi.mock("@/lib/db", () => ({
  db: { weeklyDigest: { findFirst: vi.fn().mockResolvedValue(null) } },
}));

import { extractDigest, buildPrompt, DIGEST_MODEL, DigestExtractionError } from "@/lib/digest-extraction";

const ctx = {
  people: [
    { id: "p1", name: "Jane Founder", aliases: ["jayne"] },
    { id: "p2", name: "Sam Partner", aliases: [] },
  ],
  projects: [{ id: "pr1", name: "AcmeHQ onboarding", aliases: [] }],
  openCards: [{ id: "c1", title: "Send the deck", ownerIds: ["p1"], projectId: "pr1" }],
};

function reply(obj: unknown) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }] };
}

const goodBody = {
  title: "Weekly",
  sections: [{ id: "projects", heading: "x", content: "Hello" }],
  items: [
    { title: "Send deck", owners: [{ raw: "Jayne", id: "p1" }], projectRaw: null, projectId: null, dueDate: "2026-10-16", existingCardId: "c1" },
  ],
};

describe("buildPrompt", () => {
  it("includes canonical names and open card ids", () => {
    const p = buildPrompt({ notesText: "notes", ctx, weekOf: "October 8, 2026", lastRiddle: null });
    expect(p).toContain("p1 | Jane Founder | jayne");
    expect(p).toContain("pr1 | AcmeHQ onboarding");
    expect(p).toContain("c1 | Send the deck | Jane Founder | AcmeHQ onboarding");
    expect(p).toContain("The board's spellings are always correct");
  });

  it("uses only the Jane Founder placeholder as an example name", () => {
    const p = buildPrompt({
      notesText: "notes",
      ctx: { people: [], projects: [], openCards: [] },
      weekOf: "October 8, 2026",
      lastRiddle: null,
    });
    expect(p).toContain("Jane Founder");
    expect(p).not.toMatch(/Joseph|Felix|Alvin/);
    expect(p).not.toContain("— Joseph");
  });

  it("asks for an owners array and one shared item (Q105-A)", () => {
    const p = buildPrompt({ notesText: "notes", ctx, weekOf: "October 8, 2026", lastRiddle: null });
    expect(p).toContain('"owners"');
    expect(p).toContain("return ONE item listing all of them");
    expect(p).toContain("at most 5");
  });

  it("joins an open card's owners with ' & '", () => {
    const p = buildPrompt({
      notesText: "notes",
      ctx: { ...ctx, openCards: [{ id: "c9", title: "Send the deck", ownerIds: ["p1", "p2"], projectId: null }] },
      weekOf: "October 8, 2026",
      lastRiddle: null,
    });
    expect(p).toContain("c9 | Send the deck | Jane Founder & Sam Partner | -");
  });
});

describe("extractDigest", () => {
  beforeEach(() => mockCreate.mockReset());

  it("returns validated, 6-section output and passes the model unchanged", async () => {
    mockCreate.mockResolvedValue(reply(goodBody));
    const out = await extractDigest({ notesText: "n", ctx });
    expect(mockCreate.mock.calls[0][0].model).toBe(DIGEST_MODEL);
    expect(DIGEST_MODEL).toBe("claude-sonnet-4-6");
    expect(out.sections).toHaveLength(6);
    expect(out.sections[0].content).toBe("Hello");
    expect(out.items[0]).toMatchObject({ owners: [{ raw: "Jayne", id: "p1" }], existingCardId: "c1", dueDate: "2026-10-16" });
  });

  it("nulls ids that are not in the canonical lists and bad dates", async () => {
    mockCreate.mockResolvedValue(
      reply({
        ...goodBody,
        items: [{ title: "T", owners: [{ raw: "X", id: "invented" }], projectRaw: null, projectId: "nope", dueDate: "Friday", existingCardId: "ghost" }],
      })
    );
    const out = await extractDigest({ notesText: "n", ctx });
    expect(out.items[0]).toMatchObject({ owners: [{ raw: "X", id: null }], projectId: null, existingCardId: null, dueDate: null });
  });

  it("parses several owners on one item", async () => {
    mockCreate.mockResolvedValue(
      reply({ ...goodBody, items: [{ title: "T", owners: [{ raw: "Jane Founder", id: "p1" }, { raw: "Sam Partner", id: null }] }] })
    );
    const out = await extractDigest({ notesText: "n", ctx });
    expect(out.items[0].owners).toEqual([
      { raw: "Jane Founder", id: "p1" },
      { raw: "Sam Partner", id: null },
    ]);
  });

  it("maps the legacy ownerRaw/ownerId shape into owners", async () => {
    mockCreate.mockResolvedValue(
      reply({ ...goodBody, items: [{ title: "T", ownerRaw: "Jayne", ownerId: "p1" }, { title: "U", ownerRaw: null, ownerId: null }] })
    );
    const out = await extractDigest({ notesText: "n", ctx });
    expect(out.items[0].owners).toEqual([{ raw: "Jayne", id: "p1" }]);
    expect(out.items[1].owners).toEqual([]);
  });

  it("collapses duplicate names, drops nameless entries and truncates to 5", async () => {
    const many = ["A One", "B Two", "C Three", "D Four", "E Five", "F Six"].map((raw) => ({ raw, id: null }));
    mockCreate.mockResolvedValue(
      reply({
        ...goodBody,
        items: [
          { title: "T", owners: [{ raw: "Jane Founder", id: "p1" }, { raw: "jane  founder", id: null }, { raw: null, id: "p2" }] },
          { title: "U", owners: many },
        ],
      })
    );
    const out = await extractDigest({ notesText: "n", ctx });
    expect(out.items[0].owners).toEqual([{ raw: "Jane Founder", id: "p1" }]);
    expect(out.items[1].owners).toHaveLength(5);
    expect(out.items[1].owners[4].raw).toBe("E Five");
  });

  it("retries once on malformed JSON, then succeeds", async () => {
    mockCreate.mockResolvedValueOnce(reply("not json")).mockResolvedValueOnce(reply(goodBody));
    const out = await extractDigest({ notesText: "n", ctx });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(out.items).toHaveLength(1);
  });

  it("throws after the one retry", async () => {
    mockCreate.mockResolvedValue(reply("still not json"));
    await expect(extractDigest({ notesText: "n", ctx })).rejects.toBeInstanceOf(DigestExtractionError);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("rejects a response whose items have the wrong shape", async () => {
    mockCreate.mockResolvedValue(reply({ title: "T", sections: [], items: "oops" }));
    await expect(extractDigest({ notesText: "n", ctx })).rejects.toBeInstanceOf(DigestExtractionError);
  });
});
