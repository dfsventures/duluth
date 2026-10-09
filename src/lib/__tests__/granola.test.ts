import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { granolaIntakeEnabled, noteInFolder, getGranolaNote, listFolderNotes, NOTE_ID_RE } from "@/lib/granola";

const FOLDER = "fol_AAAAAAAAAAAAAA";
const NOTE = "not_BBBBBBBBBBBBBB";

describe("granola client", () => {
  beforeEach(() => {
    process.env.GRANOLA_API_KEY = "grn_test";
    process.env.GRANOLA_FOLDER_ID = FOLDER;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GRANOLA_API_KEY;
    delete process.env.GRANOLA_FOLDER_ID;
  });

  it("is enabled only with both key and folder", () => {
    expect(granolaIntakeEnabled()).toBe(true);
    delete process.env.GRANOLA_FOLDER_ID;
    expect(granolaIntakeEnabled()).toBe(false);
  });

  it("noteInFolder matches direct or parent folder only", () => {
    expect(noteInFolder({ folder_membership: [{ id: FOLDER, parent_folder_id: null }] }, FOLDER)).toBe(true);
    expect(noteInFolder({ folder_membership: [{ id: "fol_CCCCCCCCCCCCCC", parent_folder_id: FOLDER }] }, FOLDER)).toBe(true);
    expect(noteInFolder({ folder_membership: [{ id: "fol_CCCCCCCCCCCCCC", parent_folder_id: null }] }, FOLDER)).toBe(false);
    expect(noteInFolder({ folder_membership: [] }, FOLDER)).toBe(false);
  });

  it("rejects malformed note ids before any request", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(getGranolaNote("../etc")).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
    expect(NOTE_ID_RE.test(NOTE)).toBe(true);
  });

  it("getGranolaNote returns null on 404 and sends the bearer key", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", f);
    expect(await getGranolaNote(NOTE)).toBeNull();
    expect(f.mock.calls[0][0]).toBe(`https://public-api.granola.ai/v1/notes/${NOTE}`);
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer grn_test");
  });

  it("a 401 error message carries no response content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret body", { status: 401 })));
    await expect(getGranolaNote(NOTE)).rejects.toThrow(/401/);
    await expect(getGranolaNote(NOTE)).rejects.not.toThrow(/secret/);
  });

  it("listFolderNotes pages by cursor, filters by folder_id, drops deleted", async () => {
    const mk = (id: string, deleted: string | null = null) => ({ id, title: null, created_at: "x", updated_at: "x", deleted_at: deleted });
    const f = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ notes: [mk("not_AAAAAAAAAAAAAA"), mk("not_DDDDDDDDDDDDDD", "2026-01-01")], hasMore: true, cursor: "c1" }))
      .mockResolvedValueOnce(Response.json({ notes: [mk("not_EEEEEEEEEEEEEE")], hasMore: false, cursor: null }));
    vi.stubGlobal("fetch", f);
    const out = await listFolderNotes({ updatedAfter: new Date("2026-10-01T00:00:00Z") });
    expect(out.map((n) => n.id)).toEqual(["not_AAAAAAAAAAAAAA", "not_EEEEEEEEEEEEEE"]);
    const url1 = String(f.mock.calls[0][0]);
    expect(url1).toContain(`folder_id=${FOLDER}`);
    expect(url1).toContain("updated_after=2026-10-01T00%3A00%3A00.000Z");
    expect(String(f.mock.calls[1][0])).toContain("cursor=c1");
  });
});
