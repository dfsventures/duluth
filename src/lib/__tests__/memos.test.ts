import { describe, it, expect } from "vitest";
import {
  MEMO_ERRORS,
  MEMO_LIMITS,
  MEMO_SOURCES,
  slugifyKey,
  isValidKey,
  validateMemoInput,
  validateMemoMeta,
  validateSectionInput,
  validateSections,
  validateCitations,
  validateIdempotencyKey,
  validateWebUrl,
  parseDateOnly,
  memoVisibleWhere,
  canEditMemo,
  canManageMemo,
  readCitations,
} from "@/lib/memos";
import { DEFAULT_MEMO_TEMPLATE, readTemplateSections } from "@/lib/memo-template";

const section = (key: string, markdown = "text") => ({ key, title: key, markdown });
const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

describe("limits and the contract sentences", () => {
  it("title", () => {
    expect(err(validateMemoMeta({ title: "" }))).toBe("A title of 1-200 characters is required.");
    expect(err(validateMemoMeta({ title: "   " }))).toBe("A title of 1-200 characters is required.");
    expect(err(validateMemoMeta({ title: "x".repeat(201) }))).toBe("A title of 1-200 characters is required.");
    expect(validateMemoMeta({ title: "x".repeat(200) }).ok).toBe(true);
    expect(err(validateMemoMeta({}))).toBe("A title of 1-200 characters is required.");
  });

  it("a section is limited to 20,000 characters", () => {
    expect(validateSectionInput(section("a", "x".repeat(20_000))).ok).toBe(true);
    expect(err(validateSectionInput(section("a", "x".repeat(20_001))))).toBe("A section is limited to 20,000 characters.");
  });

  it("a memo is limited to 150,000 characters in total", () => {
    const ok = Array.from({ length: 7 }, (_, i) => section(`s${i}`, "x".repeat(20_000))); // 140,000
    expect(validateSections(ok).ok).toBe(true);
    const over = [...ok, section("s7", "x".repeat(10_001))]; // 150,001
    expect(err(validateSections(over))).toBe("A memo is limited to 150,000 characters in total.");
    expect(validateSections([...ok, section("s7", "x".repeat(10_000))]).ok).toBe(true);
  });

  it("at most 30 sections, at least one", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => section(`s${i}`));
    expect(validateSections(thirty).ok).toBe(true);
    expect(err(validateSections([...thirty, section("s30")]))).toBe("A memo can have at most 30 sections.");
    expect(err(validateSections([]))).toBe(MEMO_ERRORS.noSections);
  });

  it("each section needs a different key", () => {
    expect(err(validateSections([section("a"), section("a")]))).toBe("Each section needs a different key.");
  });

  it("at most 20 citations per section", () => {
    const c = { label: "Call", kind: "call" };
    expect(validateCitations(Array(20).fill(c)).ok).toBe(true);
    expect(err(validateCitations(Array(21).fill(c)))).toBe("A section can have at most 20 citations.");
  });

  it("citation label, kind, date and url", () => {
    expect(err(validateCitations([{ label: "", kind: "call" }]))).toBe(MEMO_ERRORS.badCitation);
    expect(err(validateCitations([{ label: "x".repeat(201), kind: "call" }]))).toBe(MEMO_ERRORS.badCitation);
    expect(err(validateCitations([{ label: "x", kind: "video" }]))).toBe(MEMO_ERRORS.badCitation);
    expect(err(validateCitations([{ label: "x", kind: "web", date: "2026-02-30" }]))).toBe(MEMO_ERRORS.badDate);
    expect(err(validateCitations([{ label: "x", kind: "web", url: "javascript:alert(1)" }]))).toBe("Links must start with http:// or https://.");
    expect(err(validateCitations([{ label: "x", kind: "web", url: "ftp://example.com" }]))).toBe("Links must start with http:// or https://.");
    expect(err(validateCitations([{ label: "x", kind: "web", url: "https://example.com/" + "a".repeat(2000) }]))).toBe(MEMO_ERRORS.badUrl);
    const ok = validateCitations([{ label: " Call ", kind: "call", date: "2026-10-01", url: "https://example.com/a", extra: "dropped" }]);
    expect(ok).toEqual({ ok: true, value: [{ label: "Call", kind: "call", date: "2026-10-01", url: "https://example.com/a" }] });
  });

  it("both company fields", () => {
    expect(err(validateMemoMeta({ title: "T", companyId: "c1", companyNamePending: "Acme" }))).toBe(
      "Give either a company or a pending company name, not both."
    );
    expect(validateMemoMeta({ title: "T", companyNamePending: "Acme" }).ok).toBe(true);
    expect(validateMemoMeta({ title: "T", companyId: "c1" }).ok).toBe(true);
  });

  it("source, tags, intro date, website, intro calls", () => {
    expect(err(validateMemoMeta({ title: "T", source: "Billboard" }))).toBe(MEMO_ERRORS.badSource);
    for (const s of MEMO_SOURCES) expect(validateMemoMeta({ title: "T", source: s }).ok).toBe(true);
    expect(err(validateMemoMeta({ title: "T", tags: Array(21).fill("a").map((t, i) => t + i) }))).toBe(MEMO_ERRORS.badTags);
    expect(err(validateMemoMeta({ title: "T", tags: ["x".repeat(41)] }))).toBe(MEMO_ERRORS.badTags);
    const tags = validateMemoMeta({ title: "T", tags: [" fintech ", "Fintech", "ai"] });
    expect(tags.ok && tags.value.tags).toEqual(["fintech", "ai"]);
    expect(err(validateMemoMeta({ title: "T", introDate: "10/20/2026" }))).toBe(MEMO_ERRORS.badDate);
    const d = validateMemoMeta({ title: "T", introDate: "2026-10-20" });
    expect(d.ok && d.value.introDate?.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(err(validateMemoMeta({ title: "T", websiteUrl: "acme.example" }))).toBe(MEMO_ERRORS.badUrl);
    expect(err(validateMemoMeta({ title: "T", introCalls: Array(21).fill({ label: "x" }) }))).toBe(MEMO_ERRORS.tooManyCalls);
    expect(err(validateMemoMeta({ title: "T", introCalls: [{ label: "" }] }))).toBe(MEMO_ERRORS.badCall);
    expect(validateMemoMeta({ title: "T", introCalls: [{ label: "Intro", date: "2026-10-01", url: "https://example.com" }] }).ok).toBe(true);
  });

  it("ignores keys outside the allowlist (no spread)", () => {
    const r = validateMemoMeta({ title: "T", visibility: "TEAM", status: "FINAL", ownerId: "u2", shareLinks: [1] });
    expect(r.ok && Object.keys(r.value).sort()).toEqual(
      ["companyId", "companyNamePending", "introCalls", "introDate", "source", "tags", "title", "websiteUrl"].sort()
    );
  });

  it("validateMemoInput combines meta and sections", () => {
    const r = validateMemoInput({ title: "T", sections: [section("a")], visibility: "TEAM" });
    expect(r.ok && r.value.sections).toHaveLength(1);
    expect(err(validateMemoInput({ title: "T" }))).toBe(MEMO_ERRORS.noSections);
    expect(err(validateMemoInput({ title: "", sections: [section("a")] }))).toBe(MEMO_ERRORS.title);
  });

  it("section titles", () => {
    expect(err(validateSectionInput({ key: "a", title: "", markdown: "" }))).toBe(MEMO_ERRORS.sectionTitle);
    expect(err(validateSectionInput({ key: "a", title: "x".repeat(121), markdown: "" }))).toBe(MEMO_ERRORS.sectionTitle);
  });

  it("idempotency key", () => {
    expect(validateIdempotencyKey("abcdefgh").ok).toBe(true);
    expect(validateIdempotencyKey("a-b_C-12345").ok).toBe(true);
    for (const k of ["short", "has space 123", "x".repeat(101), "", 5, undefined, "bad/slash1"]) {
      expect(err(validateIdempotencyKey(k)), String(k)).toBe("idempotencyKey must be 8-100 letters, digits, - or _.");
    }
  });
});

describe("slugs and keys", () => {
  it("slugifies titles", () => {
    expect(slugifyKey("Open Questions")).toBe("open-questions");
    expect(slugifyKey("Go-to-Market / Hook")).toBe("go-to-market-hook");
    expect(slugifyKey("  Exit opportunities!! ")).toBe("exit-opportunities");
    expect(slugifyKey("Café Économie")).toBe("cafe-economie");
    expect(slugifyKey("!!!")).toBe("");
    expect(slugifyKey("a".repeat(60)).length).toBe(MEMO_LIMITS.keyLength);
  });
  it("accepts only lowercase slugs up to 40", () => {
    expect(isValidKey("open-questions")).toBe(true);
    expect(isValidKey("a")).toBe(true);
    for (const k of ["", "Open", "a b", "-a", "a-", "a--b", "a_b", "x".repeat(41), 5, null]) expect(isValidKey(k), String(k)).toBe(false);
    expect(err(validateSectionInput({ key: "Bad Key", title: "t", markdown: "" }))).toBe(MEMO_ERRORS.badKey);
  });
  it("every default template key is a valid, unique slug", () => {
    const keys = DEFAULT_MEMO_TEMPLATE.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(isValidKey(k), k).toBe(true);
    for (const s of DEFAULT_MEMO_TEMPLATE) expect(slugifyKey(s.title.replace("/", " "))).toBeTruthy();
  });
});

describe("helpers", () => {
  it("parseDateOnly is strict", () => {
    expect(parseDateOnly("2026-10-20")?.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    for (const v of ["2026-13-01", "2026-02-30", "2026-1-1", "", null, 5]) expect(parseDateOnly(v), String(v)).toBeNull();
  });
  it("validateWebUrl accepts http(s) only", () => {
    expect(validateWebUrl("https://example.com/a?b=1").ok).toBe(true);
    expect(validateWebUrl("http://example.com").ok).toBe(true);
    for (const v of ["javascript:alert(1)", "data:text/html,x", "//example.com", "https://exa mple.com", " ", 5]) {
      expect(validateWebUrl(v).ok, String(v)).toBe(false);
    }
  });
  it("readCitations drops malformed stored rows", () => {
    expect(readCitations([{ label: "ok", kind: "call" }, { label: "", kind: "call" }, "x", null])).toEqual([{ label: "ok", kind: "call" }]);
    expect(readCitations("nope")).toEqual([]);
  });
  it("readTemplateSections drops malformed rows and duplicates", () => {
    const out = readTemplateSections([
      { key: "a", title: "A", guidance: "g", required: true, shareByDefault: false },
      { key: "a", title: "dup" },
      { key: "Bad Key", title: "x" },
      { key: "b", title: " " },
      { key: "c", title: "C" },
    ]);
    expect(out).toEqual([
      { key: "a", title: "A", guidance: "g", required: true, shareByDefault: false },
      { key: "c", title: "C", guidance: "", required: false, shareByDefault: true },
    ]);
  });
  it("the default template matches the house format, Open Questions not shared by default", () => {
    expect(DEFAULT_MEMO_TEMPLATE.map((s) => s.title)).toEqual([
      "Open Questions", "Company Overview", "Product", "Market Opportunity", "Traction", "Business Model",
      "Go-to-Market / Hook", "Competition / Status Quo", "Team", "Round / Investment Terms", "Key Risks", "Exit opportunities",
    ]);
    expect(DEFAULT_MEMO_TEMPLATE.filter((s) => !s.shareByDefault).map((s) => s.key)).toEqual(["open-questions"]);
  });
});

describe("visibility helpers", () => {
  it("memoVisibleWhere: not archived, and owned or shared with the team", () => {
    expect(memoVisibleWhere("u1")).toEqual({ archivedAt: null, OR: [{ ownerId: "u1" }, { visibility: "TEAM" }] });
  });
  it("canEditMemo: the owner, or anyone once shared with the team (Q116-A)", () => {
    expect(canEditMemo({ ownerId: "u1", visibility: "PRIVATE" }, "u1")).toBe(true);
    expect(canEditMemo({ ownerId: "u1", visibility: "PRIVATE" }, "u2")).toBe(false);
    expect(canEditMemo({ ownerId: "u1", visibility: "TEAM" }, "u2")).toBe(true);
  });
  it("canManageMemo: owner only (Q117-A)", () => {
    expect(canManageMemo({ ownerId: "u1" }, "u1")).toBe(true);
    expect(canManageMemo({ ownerId: "u1" }, "u2")).toBe(false);
  });
});
