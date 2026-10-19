import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 37, WS108.1 — shared digest extraction: prompt content, zod validation,
// one retry on malformed JSON, unknown ids nulled.

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...a: unknown[]) => mockCreate(...a) };
  },
}));
vi.mock("@/lib/db", () => ({
  db: { weeklyDigest: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
}));

import { extractDigest, buildPrompt, DIGEST_MODEL, DigestExtractionError, SECTION_DEFS, riddleQuestion } from "@/lib/digest-extraction";

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
  sections: [{ id: "fund", heading: "x", content: "Hello" }],
  items: [
    { title: "Send deck", owners: [{ raw: "Jayne", id: "p1" }], projectRaw: null, projectId: null, dueDate: "2026-10-16", existingCardId: "c1" },
  ],
};

describe("buildPrompt", () => {
  it("includes canonical names and open card ids", () => {
    const p = buildPrompt({ notesText: "notes", ctx, weekOf: "October 8, 2026", pastRiddles: [] });
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
      pastRiddles: [],
    });
    expect(p).toContain("Jane Founder");
    expect(p).not.toMatch(/Joseph|Felix|Alvin/);
    expect(p).not.toContain("— Joseph");
  });

  it("asks for an owners array and one shared item (Q105-A)", () => {
    const p = buildPrompt({ notesText: "notes", ctx, weekOf: "October 8, 2026", pastRiddles: [] });
    expect(p).toContain('"owners"');
    expect(p).toContain("return ONE item listing all of them");
    expect(p).toContain("at most 5");
  });

  it("joins an open card's owners with ' & '", () => {
    const p = buildPrompt({
      notesText: "notes",
      ctx: { ...ctx, openCards: [{ id: "c9", title: "Send the deck", ownerIds: ["p1", "p2"], projectId: null }] },
      weekOf: "October 8, 2026",
      pastRiddles: [],
    });
    expect(p).toContain("c9 | Send the deck | Jane Founder & Sam Partner | -");
  });

  it("defines every section, the placement order and the leave-out list", () => {
    const p = buildPrompt({ notesText: "notes", ctx, weekOf: "October 8, 2026", pastRiddles: [] });
    for (const s of SECTION_DEFS) expect(p).toContain(`id: "${s.id}", heading: "${s.heading}"`);
    expect(p).toContain("take the first question that is a yes");
    expect(p).toContain("Never repeat a fact in a second section");
    expect(p).toContain("Leave out entirely: travel logistics");
    expect(p).toContain(`exactly ${SECTION_DEFS.length} objects`);
    expect(p).not.toContain("should be populated");
  });

  it("keeps work travel out of Team life and talks in their own section", () => {
    const life = SECTION_DEFS.find((s) => s.id === "life")!;
    expect(life.guide).toContain("Never work, including work travel and talks");
    expect(SECTION_DEFS.map((s) => s.id)).toEqual(["fund", "portfolio", "research", "team", "news", "travel", "life", "riddle"]);
  });

  it("reveals last week's answer and forbids repeating any past riddle", () => {
    const p = buildPrompt({
      notesText: "notes",
      ctx,
      weekOf: "October 8, 2026",
      pastRiddles: ["I have cities but no houses. What am I?", "The more you take, the more you leave behind."],
    });
    expect(p).toContain('Last week\'s riddle was: "I have cities but no houses. What am I?"');
    expect(p).toContain('- "I have cities but no houses. What am I?"');
    expect(p).toContain('- "The more you take, the more you leave behind."');
    expect(p).toContain("must be different from every past riddle");
  });

  it("strips old answers and footers from stored riddles", () => {
    expect(riddleQuestion("Last week's answer: Time. Here is this week's riddle: I have cities. What am I?")).toBe(
      "I have cities. What am I?"
    );
    expect(riddleQuestion("Last week's answer: A map.\n\nThe more you take, the more you leave behind.")).toBe(
      "The more you take, the more you leave behind."
    );
    expect(riddleQuestion("What has keys but no locks?\n\n(Answer revealed next week)")).toBe("What has keys but no locks?");
  });

  it("asks for an original riddle with no history", () => {
    const p = buildPrompt({ notesText: "notes", ctx, weekOf: "October 8, 2026", pastRiddles: [] });
    expect(p).toContain("(Answer revealed next week)");
    expect(p).not.toContain("must be different from every past riddle");
  });
});

describe("extractDigest", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockFindMany.mockReset().mockResolvedValue([]);
  });

  it("returns validated output with every section and passes the model", async () => {
    mockCreate.mockResolvedValue(reply(goodBody));
    const out = await extractDigest({ notesText: "n", ctx });
    expect(mockCreate.mock.calls[0][0].model).toBe(DIGEST_MODEL);
    expect(DIGEST_MODEL).toBe("claude-sonnet-5-5");
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(16000);
    expect(out.sections.map((s) => s.id)).toEqual(SECTION_DEFS.map((s) => s.id));
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

  it("renames DFS Lab to DFS in section content", async () => {
    mockCreate.mockResolvedValue(
      reply({ ...goodBody, sections: [{ id: "fund", heading: "x", content: "DFS Lab skews earlier than DFS Labs." }] })
    );
    const out = await extractDigest({ notesText: "n", ctx });
    expect(out.sections[0].content).toBe("DFS skews earlier than DFS Labs.");
  });

  it("reads the JSON from the text block when a thinking block comes first", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "thinking", thinking: "", signature: "s" },
        { type: "text", text: JSON.stringify(goodBody) },
      ],
    });
    const out = await extractDigest({ notesText: "n", ctx });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(out.items).toHaveLength(1);
  });

  it("feeds only sent digests' riddles into the prompt, newest first", async () => {
    mockFindMany.mockResolvedValue([
      { sections: [{ id: "riddle", content: "<p>Riddle B</p>" }] },
      { sections: [{ id: "life", content: "x" }] },
      { sections: [{ id: "riddle", content: "Riddle A" }] },
    ]);
    mockCreate.mockResolvedValue(reply(goodBody));
    await extractDigest({ notesText: "n", ctx });
    expect(mockFindMany.mock.calls[0][0]).toMatchObject({ where: { sentAt: { not: null } }, take: 8 });
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('- "Riddle B"\n- "Riddle A"');
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
