import { describe, it, expect, vi, beforeEach } from "vitest";

const m = {
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  cardFind: vi.fn(),
  cardCreateMany: vi.fn(),
  cardUpdate: vi.fn(),
  cardFirst: vi.fn(),
  digestFind: vi.fn(),
  digestCreate: vi.fn(),
  userFind: vi.fn(),
  getNote: vi.fn(),
  extract: vi.fn(),
  email: vi.fn(),
};

vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(msg: string, o: { code: string }) {
      super(msg);
      this.code = o.code;
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } };
});

vi.mock("@/lib/db", () => {
  const tx = {
    boardCard: {
      findFirst: (...a: unknown[]) => m.cardFirst(...a),
      createMany: (...a: unknown[]) => m.cardCreateMany(...a),
      update: (...a: unknown[]) => m.cardUpdate(...a),
    },
    weeklyDigest: {
      findUnique: (...a: unknown[]) => m.digestFind(...a),
      create: (...a: unknown[]) => m.digestCreate(...a),
    },
    granolaIntake: { update: (...a: unknown[]) => m.update(...a) },
  };
  return {
    db: {
      granolaIntake: {
        create: (...a: unknown[]) => m.create(...a),
        update: (...a: unknown[]) => m.update(...a),
        updateMany: (...a: unknown[]) => m.updateMany(...a),
        findUnique: (...a: unknown[]) => m.findUnique(...a),
        findMany: vi.fn().mockResolvedValue([]),
      },
      boardCard: { findMany: (...a: unknown[]) => m.cardFind(...a) },
      user: { findFirst: (...a: unknown[]) => m.userFind(...a) },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDigestDraftReadyEmail: (...a: unknown[]) => m.email(...a), BASE_URL: "https://x.test" }));
vi.mock("@/lib/granola", async (orig) => ({
  ...(await orig<typeof import("@/lib/granola")>()),
  getGranolaNote: (...a: unknown[]) => m.getNote(...a),
  listFolderNotes: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/digest-extraction", () => ({
  extractDigest: (...a: unknown[]) => m.extract(...a),
  DigestExtractionError: class extends Error {},
}));
vi.mock("@/lib/board-server", () => ({
  loadBoardContext: vi.fn().mockResolvedValue({
    people: [{ id: "p1", name: "Jane Founder", aliases: [], email: "jane@example.test" }],
    projects: [],
    openCards: [],
  }),
  buildDigestActionItems: vi.fn().mockResolvedValue({ created: 0, updated: 0 }),
  titleKey: (t: string) => t.toLowerCase().slice(0, 12),
}));

import { enqueueGranolaNote, claim, processGranolaIntake, previewGranolaNote, safeErrorText } from "@/lib/granola-intake";
import { Prisma } from "@prisma/client";

const FOLDER = "fol_AAAAAAAAAAAAAA";
const NOTE = "not_BBBBBBBBBBBBBB";

const note = (over: Record<string, unknown> = {}) => ({
  id: NOTE,
  title: "Synthetic sync",
  owner: { name: "Rec Order", email: "rec@example.test" },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  calendar_event: null,
  attendees: [{ name: "Jane Founder", email: "jane@example.test" }],
  folder_membership: [{ id: FOLDER, parent_folder_id: null }],
  summary_text: "text",
  summary_markdown: "# notes",
  ...over,
});

const extracted = {
  title: "Digest",
  sections: [{ id: "projects", heading: "Running Projects", content: "a <b> & b" }],
  items: [{ title: "Send deck", ownerRaw: "Jane", ownerId: null, projectRaw: null, projectId: null, dueDate: null, existingCardId: null }],
};

describe("granola intake", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset());
    process.env.GRANOLA_API_KEY = "k";
    process.env.GRANOLA_FOLDER_ID = FOLDER;
    m.updateMany.mockResolvedValue({ count: 1 });
    m.findUnique.mockResolvedValue({ id: "i1", noteId: NOTE });
    m.getNote.mockResolvedValue(note());
    m.extract.mockResolvedValue(extracted);
    m.cardFind.mockResolvedValue([]);
    m.cardFirst.mockResolvedValue(null);
    m.cardCreateMany.mockResolvedValue({ count: 1 });
    m.digestFind.mockResolvedValue(null);
    m.update.mockResolvedValue({});
    m.userFind.mockResolvedValue({ email: "rec@example.test" });
    m.email.mockResolvedValue(undefined);
  });

  it("a second enqueue of the same note returns null (P2002) and records the event id", async () => {
    m.create.mockRejectedValueOnce(new (Prisma.PrismaClientKnownRequestError as any)("dup", { code: "P2002" }));
    m.update.mockResolvedValue({});
    expect(await enqueueGranolaNote(NOTE, "WEBHOOK", "evt1")).toBeNull();
    expect(m.update).toHaveBeenCalledWith({ where: { noteId: NOTE }, data: { lastEventId: "evt1" } });
  });

  it("of two concurrent claims exactly one wins", async () => {
    m.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const r = await Promise.all([claim("i1"), claim("i1")]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });

  it("an outside-folder note is SKIPPED and Claude is never called", async () => {
    m.getNote.mockResolvedValue(note({ folder_membership: [{ id: "fol_ZZZZZZZZZZZZZZ", parent_folder_id: null }] }));
    const res = await processGranolaIntake("i1");
    expect(res).toMatchObject({ outcome: "skipped", reason: "outside folder" });
    expect(m.extract).not.toHaveBeenCalled();
  });

  it("an inaccessible (404) note is SKIPPED before Claude", async () => {
    m.getNote.mockResolvedValue(null);
    expect((await processGranolaIntake("i1")).outcome).toBe("skipped");
    expect(m.extract).not.toHaveBeenCalled();
  });

  it("a note older than 7 days is SKIPPED; manual runs bypass the age guard", async () => {
    m.getNote.mockResolvedValue(note({ created_at: new Date(Date.now() - 8 * 86400_000).toISOString() }));
    const res = await processGranolaIntake("i1");
    expect(res).toMatchObject({ outcome: "skipped", reason: "older than 7 days" });
    expect(m.extract).not.toHaveBeenCalled();
    expect((await processGranolaIntake("i1", { manual: true })).outcome).toBe("done");
  });

  it("no summary goes back to PENDING without spending an attempt, before Claude", async () => {
    m.getNote.mockResolvedValue(note({ summary_markdown: null, summary_text: "" }));
    const res = await processGranolaIntake("i1");
    expect(res.outcome).toBe("retry-later");
    expect(m.extract).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: expect.objectContaining({ status: "PENDING", attempts: { decrement: 1 } }),
    });
  });

  it("happy path: keyed creates, escaped section html, digest created, recorder emailed", async () => {
    const res = await processGranolaIntake("i1");
    expect(res).toMatchObject({ outcome: "done", cardsCreated: 1 });
    const data = m.cardCreateMany.mock.calls[0][0];
    expect(data.skipDuplicates).toBe(true);
    expect(data.data[0]).toMatchObject({ source: "GRANOLA", sourceRef: NOTE, humanEditedAt: null, sourceKey: `granola:${NOTE}:send deck` });
    expect(m.digestCreate.mock.calls[0][0].data).toMatchObject({ source: "GRANOLA", granolaNoteId: NOTE });
    expect(m.digestCreate.mock.calls[0][0].data.sections[0].content).toBe("<p>a &lt;b&gt; &amp; b</p>");
    expect(m.email).toHaveBeenCalledTimes(1);
  });

  it("attendee first-name hint resolves an owner by email", async () => {
    await processGranolaIntake("i1");
    expect(m.cardCreateMany.mock.calls[0][0].data[0].ownerId).toBe("p1");
  });

  it("retry after a crash reuses the existing draft, creates no second one, sends no second email", async () => {
    m.digestFind.mockResolvedValue({ id: "d-existing" });
    m.cardCreateMany.mockResolvedValue({ count: 0 }); // skipDuplicates swallowed the dup
    const res = await processGranolaIntake("i1");
    expect(res).toMatchObject({ outcome: "done", digestId: "d-existing", cardsCreated: 0 });
    expect(m.digestCreate).not.toHaveBeenCalled();
    expect(m.email).not.toHaveBeenCalled();
  });

  it("a human-edited card is untouched on retry (no create, no fill)", async () => {
    m.cardFind.mockResolvedValue([
      { id: "c1", sourceKey: `granola:${NOTE}:send deck`, humanEditedAt: new Date(), ownerId: null, projectId: null, dueDate: null },
    ]);
    const res = await processGranolaIntake("i1");
    expect(res.cardsCreated).toBe(0);
    expect(m.cardCreateMany).not.toHaveBeenCalled();
    expect(m.cardUpdate).not.toHaveBeenCalled();
  });

  it("a dry run writes nothing and never claims", async () => {
    const res = await processGranolaIntake("i1", { dryRun: true });
    expect(res.outcome).toBe("dry-run");
    expect(res.preview?.items[0]).toMatchObject({ title: "Send deck", action: "create" });
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.cardCreateMany).not.toHaveBeenCalled();
    expect(m.digestCreate).not.toHaveBeenCalled();
    expect(m.email).not.toHaveBeenCalled();
  });

  it("previewGranolaNote needs no intake row", async () => {
    const res = await previewGranolaNote(NOTE);
    expect(res.outcome).toBe("dry-run");
    expect(m.findUnique).not.toHaveBeenCalled();
  });

  it("a failed email does not fail the intake", async () => {
    m.email.mockRejectedValue(new Error("resend down"));
    expect((await processGranolaIntake("i1")).outcome).toBe("done");
  });

  it("failures are stored as FAILED with a content-free error", async () => {
    m.extract.mockRejectedValue(Object.assign(new Error("echoed: SECRET NOTE TEXT"), { name: "APIError", status: 500 }));
    const res = await processGranolaIntake("i1");
    expect(res.outcome).toBe("failed");
    const failedCall = m.update.mock.calls.find((c) => c[0].data.status === "FAILED");
    expect(failedCall![0].data.error).toBe("APIError 500");
    expect(JSON.stringify(m.update.mock.calls)).not.toContain("SECRET");
  });

  it("safeErrorText never passes through unknown error messages", () => {
    expect(safeErrorText(new Error("title: Confidential"))).toBe("Error");
  });
});
