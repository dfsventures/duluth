import { describe, it, expect } from "vitest";
import {
  NOTION_IMPORT_MIN_BODY,
  cleanNotionBody,
  keyForHeading,
  mapSource,
  parseIntroCalls,
  parseNotionDate,
  parseNotionPage,
  readPropertyBlock,
  splitSections,
  statusForDecision,
  type NotionMemoDraft,
} from "@/lib/notion-memo-import";
import { renderMemoMarkdown } from "@/lib/memo-render";

// Part 41 (WS133): synthetic pages only (Acme, Globex, Jane Founder). Nothing here is real deal data.

const ID = "0123456789abcdef0123456789abcdef";
const FILE = `Acme ${ID}.md`;
const filler = (n: number) => "Lorem ipsum dolor sit amet. ".repeat(Math.ceil(n / 28)).slice(0, n);
const page = (props: string[], body: string, title = "Acme") => `# ${title}\n\n${props.join("\n")}\n\n${body}`;
const draftOf = (text: string, file = FILE): NotionMemoDraft => {
  const r = parseNotionPage(file, text);
  if (r.kind !== "memo") throw new Error(`expected a memo, got ${r.kind}${r.kind === "error" ? `: ${r.error}` : ""}`);
  return r.draft;
};
const sectionsOf = (md: string) => splitSections(md).map((s) => s.title);

describe("readPropertyBlock", () => {
  it("reads known keys, ends at the first blank line, and joins a continuation line", () => {
    const lines = ["Tags: a, b", "Decision: Invested", "Intro Call Notes: https://example.com/one", "https://example.com/two", "Source: VC Intro", "", "Body starts here"];
    const { props, bodyStart } = readPropertyBlock(lines);
    expect(props["Tags"]).toBe("a, b");
    expect(props["Intro Call Notes"]).toBe("https://example.com/one\nhttps://example.com/two");
    expect(props["Source"]).toBe("VC Intro");
    expect(lines[bodyStart]).toBe("Body starts here");
  });
  it("no property block: nothing consumed", () => {
    const { props, bodyStart } = readPropertyBlock(["Just text", "more"]);
    expect(props).toEqual({});
    expect(bodyStart).toBe(0);
  });
});

describe("stub or memo (JC-NI-B)", () => {
  it("a page with no body is a stub", () => {
    expect(parseNotionPage(FILE, page(["Decision: Passed"], "")).kind).toBe("stub");
  });
  it("199 non-whitespace characters is a stub, 200 is a memo", () => {
    expect(NOTION_IMPORT_MIN_BODY).toBe(200);
    const body = (n: number) => "x".repeat(n);
    expect(parseNotionPage(FILE, page(["Decision: Passed"], body(199))).kind).toBe("stub");
    expect(parseNotionPage(FILE, page(["Decision: Passed"], body(200))).kind).toBe("memo");
  });
  it("whitespace does not count towards the threshold", () => {
    expect(parseNotionPage(FILE, page([], `${"x ".repeat(99)}\n\n\n   \n`)).kind).toBe("stub");
  });
  it("a file name without a Notion id is an error", () => {
    const r = parseNotionPage("Acme.md", page([], filler(300)));
    expect(r).toMatchObject({ kind: "error", notionId: null });
  });
  it("takes the id and title from the file and the first line", () => {
    const d = draftOf(page(["Decision: Memo"], filler(300), "Globex"), `Globex Inc ${ID.toUpperCase().toLowerCase()}.md`);
    expect(d.notionId).toBe(ID);
    expect(d.title).toBe("Globex");
  });
});

describe("splitSections (JC-NI-C)", () => {
  it("### sections", () => {
    expect(sectionsOf(`### Team\n\nJane\n\n### Product\n\nWidget\n\n### Traction\n\nGrowing`)).toEqual(["Team", "Product", "Traction"]);
  });
  it("## sections with ### subsections kept inside", () => {
    const out = splitSections(`## Team\n\nJane\n\n### Background\n\nPayments\n\n## Product\n\nWidget\n\n### Roadmap\n\nLater`);
    expect(out.map((s) => s.title)).toEqual(["Team", "Product"]);
    expect(out[0].markdown).toContain("### Background");
  });
  it("mixed: ## x3 then ### x8 gives 11 sections", () => {
    const names = ["Team", "Product", "Market", "Traction", "Business Model", "Competition", "Key Risks", "Ask", "Exit Opportunities", "Overview", "Open Questions"];
    const md = names.map((n, i) => `${i < 3 ? "##" : "###"} ${n}\n\ntext ${i}`).join("\n\n");
    expect(splitSections(md).map((s) => s.title)).toEqual(names);
  });
  it("### sections with a single trailing ## also split there", () => {
    expect(sectionsOf(`### Team\n\nJane\n\n### Product\n\nWidget\n\n### Traction\n\nGrowing\n\n## Key Risks\n\nMany`)).toEqual(["Team", "Product", "Traction", "Key Risks"]);
  });
  it("a heading at the split level that ends with a colon stays inside its section", () => {
    const out = splitSections(`### Traction\n\n### Recent performance:\n\nUp\n\n### Team\n\nJane`);
    expect(out.map((s) => s.title)).toEqual(["Traction", "Team"]);
    expect(out[0].markdown).toContain("Recent performance:");
  });
  it("headings inside code fences are not headings", () => {
    expect(sectionsOf("### Team\n\n```\n### not a heading\n```\n\n### Product\n\nWidget")).toEqual(["Team", "Product"]);
  });
  it("bold-only lines split when there are no ATX headings", () => {
    const out = splitSections(`**Team**\n\nJane\n\n**Product**\n\nWidget`);
    expect(out.map((s) => s.title)).toEqual(["Team", "Product"]);
    expect(out[1].markdown).toBe("Widget");
  });
  it("one bold line is not enough: a single Memo section", () => {
    expect(splitSections(`**Only one**\n\nJane\n\nPlain text`)).toEqual([{ title: "Memo", markdown: "**Only one**\n\nJane\n\nPlain text", preamble: false }]);
  });
  it("no headings at all: one Memo section", () => {
    expect(splitSections("Just a paragraph.\n\nAnd another.").map((s) => s.title)).toEqual(["Memo"]);
  });
  it("text before the first heading is an Introduction preamble", () => {
    const out = splitSections(`Status: in review\n\n### Team\n\nJane`);
    expect(out[0]).toMatchObject({ title: "Introduction", preamble: true });
    expect(out[1].title).toBe("Team");
  });
  it("trims leading and trailing rules in a section", () => {
    expect(splitSections(`### Team\n\n---\n\nJane\n\n---\n\n### Product\n\nWidget`)[0].markdown).toBe("Jane");
  });
});

describe("keys (JC-NI-D) and share defaults (JC-NI-E)", () => {
  it("an alias match takes the template key and keeps the Notion title", () => {
    const d = draftOf(page([], `### Product & Solution\n\n${filler(300)}\n\n### Funding & Use of Funds\n\n${filler(50)}`));
    expect(d.sections.map((s) => [s.key, s.title])).toEqual([
      ["product", "Product & Solution"],
      ["round-investment-terms", "Funding & Use of Funds"],
    ]);
  });
  it("no alias: a slug; empty slug: section; repeats get -2, -3", () => {
    const used = new Set<string>();
    expect(keyForHeading("Why This Works", used)).toEqual({ key: "why-this-works", matched: false });
    expect(keyForHeading("???", used).key).toBe("section");
    expect(keyForHeading("Business Model", used)).toEqual({ key: "business-model", matched: true });
    expect(keyForHeading("Business Model", used).key).toBe("business-model-2");
    expect(keyForHeading("The Business Model (draft)", used).key).toBe("business-model-3");
  });
  it("a duplicate heading in a page gets -2", () => {
    const d = draftOf(page([], `### Traction\n\n${filler(300)}\n\n### Traction\n\n${filler(50)}`));
    expect(d.sections.map((s) => s.key)).toEqual(["traction", "traction-2"]);
  });
  it("open questions, the preamble, 'question' headings and internal-view headings are out of share links", () => {
    const heads = ["Open Questions", "Team Thoughts", "Internal View & Recommendation", "Investment Decision", "Due Diligence Checks", "Potential Acme Integration", "Key Risks & Open Questions", "Team", "Product"];
    const body = `Status note.\n\n${heads.map((h) => `### ${h}\n\n${filler(40)}`).join("\n\n")}`;
    const d = draftOf(page([], body));
    const share = Object.fromEntries(d.sections.map((s) => [s.title, s.includeInShare]));
    expect(share["Introduction"]).toBe(false);
    for (const h of heads.slice(0, 7)) expect(share[h], h).toBe(false);
    expect(share["Team"]).toBe(true);
    expect(share["Product"]).toBe(true);
  });
  it("'Key Risks & Open Questions' maps to key-risks (Q128-A)", () => {
    const d = draftOf(page([], `### Key Risks & Open Questions\n\n${filler(300)}\n\n### Risks, Concerns & Open Questions\n\n${filler(40)}`));
    expect(d.sections.map((s) => s.key)).toEqual(["key-risks", "key-risks-2"]);
    expect(d.sections.every((s) => !s.includeInShare)).toBe(true);
  });
});

describe("cleanNotionBody (JC-NI-F)", () => {
  it("a callout becomes a blockquote; its table still renders as a table", () => {
    const body = `Before\n<aside>\n<img src="notion://custom_emoji/abc/def" alt="x" width="20px" />\n\nHeadline\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n</aside>\nAfter`;
    const { markdown, warnings } = cleanNotionBody(body);
    expect(markdown).not.toContain("<aside>");
    expect(markdown).not.toContain("notion://");
    expect(markdown).toContain("> Headline");
    expect(markdown).toContain("> | A | B |");
    expect(warnings).toEqual([]);
    const html = renderMemoMarkdown(markdown, { surface: "app" });
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<table>");
    expect(html).not.toContain("&lt;aside");
  });
  it("a notion:// image outside a callout is dropped", () => {
    const { markdown } = cleanNotionBody(`Text\n<img src="notion://custom_emoji/x" />\nMore`);
    expect(markdown).toBe("Text\nMore");
  });
  it("other images and markdown images become placeholders", () => {
    const { markdown } = cleanNotionBody(`![shot.png](Acme%20Folder/shot.png)\n\n![](Acme%20Folder/chart%201.png)\n\n<img src="https://example.com/a.png" alt="A chart">`);
    expect(markdown).toContain("[Image not imported: shot.png]");
    expect(markdown).toContain("[Image not imported: chart 1.png]");
    expect(markdown).toContain("[Image not imported: A chart]");
    expect(markdown).not.toContain("![");
  });
  it("a relative link becomes text (file not imported); http, mailto and # links stay", () => {
    const { markdown } = cleanNotionBody(`See [the deck](Acme%20Folder/deck.pdf), [site](https://example.com), [mail](mailto:a@example.com), [here](#top) and [page](Globex%20abc.md).`);
    expect(markdown).toContain("the deck (file not imported)");
    expect(markdown).toContain("page (file not imported)");
    expect(markdown).toContain("[site](https://example.com)");
    expect(markdown).toContain("[mail](mailto:a@example.com)");
    expect(markdown).toContain("[here](#top)");
  });
  it("a leftover raw HTML tag is a warning that carries no body text", () => {
    const { warnings } = cleanNotionBody(`Plain <span style="color:red">SECRET-BODY-TEXT</span> and <https://example.com> autolink`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Raw HTML left/);
    expect(warnings.join(" ")).not.toContain("SECRET-BODY-TEXT");
  });
  it("code fences are left alone", () => {
    const { markdown, warnings } = cleanNotionBody("```\n<span>x</span> [a](b.pdf)\n```");
    expect(markdown).toContain("<span>x</span> [a](b.pdf)");
    expect(warnings).toEqual([]);
  });
});

describe("limits (JC-NI-G)", () => {
  it("a 25,000-character section becomes two sections and loses no text", () => {
    const para = `${"word ".repeat(100)}\n\n`;
    const long = para.repeat(50).trim(); // ~25,000 characters
    expect(long.length).toBeGreaterThan(24_000);
    const d = draftOf(page([], `### Product\n\n${long}`));
    expect(d.sections.map((s) => s.title)).toEqual(["Product", "Product (continued 2)"]);
    expect(d.sections.every((s) => s.markdown.length <= 20_000)).toBe(true);
    const joined = d.sections.map((s) => s.markdown).join("\n\n").replace(/\s+/g, "");
    expect(joined).toBe(long.replace(/\s+/g, ""));
    expect(new Set(d.sections.map((s) => s.key)).size).toBe(2);
  });
  it("a 160,000-character memo is an error, not a truncation", () => {
    const sections = Array.from({ length: 8 }, (_, i) => `### Part ${i}\n\n${"word ".repeat(4000)}`).join("\n\n");
    const r = parseNotionPage(FILE, page([], sections));
    expect(r).toMatchObject({ kind: "error", error: "A memo is limited to 150,000 characters in total." });
  });
  it("more than 30 sections is an error", () => {
    const sections = Array.from({ length: 31 }, (_, i) => `### Part ${i}\n\n${filler(20)}`).join("\n\n");
    expect(parseNotionPage(FILE, page([], sections))).toMatchObject({ kind: "error", error: "A memo can have at most 30 sections." });
  });
});

describe("dates, sources, decisions, tags, website", () => {
  it("parseNotionDate", () => {
    expect(parseNotionDate("January 26, 2026")).toBe("2026-01-26");
    expect(parseNotionDate("April 8, 2026 12:20 PM")).toBe("2026-04-08");
    expect(parseNotionDate("Sep 3, 2025")).toBe("2025-09-03");
    expect(parseNotionDate("February 30, 2026")).toBeNull();
    expect(parseNotionDate("soon")).toBeNull();
    expect(parseNotionDate(undefined)).toBeNull();
  });
  it("mapSource: exact (any case), an event value, unknown, empty", () => {
    expect(mapSource("founder intro")).toEqual({ source: "Founder Intro" });
    expect(mapSource("Cold Outreach")).toEqual({ source: "Cold Outreach" });
    expect(mapSource("Acme Event")).toEqual({ source: "Partner event" });
    expect(mapSource("Billboard").source).toBeNull();
    expect(mapSource("Billboard").warning).toBeTruthy();
    expect(mapSource("")).toEqual({ source: null });
    expect(mapSource("Conference")).toEqual({ source: "Conference" });
  });
  it("decision mapping, status per Q127-A, and an unknown decision warns", () => {
    const body = filler(300);
    const dec = (v: string) => draftOf(page([`Decision: ${v}`], body));
    expect(dec("In Progress").decision).toBe("IN_PROGRESS");
    expect(dec("Invested").decision).toBe("INVESTED");
    expect(dec("Maybe").decision).toBeNull();
    expect(dec("Maybe").warnings.join()).toMatch(/Decision not recognised/);
    expect(statusForDecision("INVESTED")).toBe("FINAL");
    expect(statusForDecision("PASSED")).toBe("FINAL");
    expect(statusForDecision("LATER")).toBe("FINAL");
    expect(statusForDecision("MEMO")).toBe("IN_REVIEW");
    expect(statusForDecision("IN_PROGRESS")).toBe("IN_REVIEW");
    expect(statusForDecision(null)).toBe("DRAFT");
  });
  it("website without a scheme gets https://, a trailing space goes, an invalid value is dropped with a warning", () => {
    const body = filler(300);
    expect(draftOf(page(["URL: acme.example.com "], body)).websiteUrl).toBe("https://acme.example.com");
    const bad = draftOf(page(["URL: not a url"], body));
    expect(bad.websiteUrl).toBeNull();
    expect(bad.warnings.join()).toMatch(/Website/);
  });
  it("tags are split on commas; a tag over 40 characters is an error", () => {
    expect(draftOf(page(["Tags: Fintech, Seed ,Infrastructure"], filler(300))).tags).toEqual(["Fintech", "Seed", "Infrastructure"]);
    expect(parseNotionPage(FILE, page([`Tags: ${"x".repeat(41)}`], filler(300))).kind).toBe("error");
  });
  it("Last Edit becomes noon UTC; Intro Date a date", () => {
    const d = draftOf(page(["Intro Date: October 3, 2025", "Last Edit: April 28, 2026 12:20 PM"], filler(300)));
    expect(d.introDate).toBe("2025-10-03");
    expect(d.lastEdited?.toISOString()).toBe("2026-04-28T12:00:00.000Z");
  });
});

describe("parseIntroCalls (JC-NI-P)", () => {
  it("a bare URL: 'Intro call', dated by the intro date", () => {
    expect(parseIntroCalls("https://example.com/a", "2025-10-03")).toEqual([{ label: "Intro call", date: "2025-10-03", url: "https://example.com/a" }]);
  });
  it("two URLs on two lines: numbered; only the first gets the intro date", () => {
    expect(parseIntroCalls("https://example.com/a\nhttps://example.com/b", "2025-10-03")).toEqual([
      { label: "Intro call 1", date: "2025-10-03", url: "https://example.com/a" },
      { label: "Intro call 2", url: "https://example.com/b" },
    ]);
  });
  it("' | ' with labels and (Mon D, YYYY) dates", () => {
    expect(parseIntroCalls("First call (Jan 5, 2026): https://example.com/a | Follow-up (Feb 9, 2026): https://example.com/b", null)).toEqual([
      { label: "First call", date: "2026-01-05", url: "https://example.com/a" },
      { label: "Follow-up", date: "2026-02-09", url: "https://example.com/b" },
    ]);
  });
  it("'Label — Mon D, YYYY: URL'", () => {
    expect(parseIntroCalls("Call with Jane Founder — January 5, 2026: https://example.com/a", null)).toEqual([
      { label: "Call with Jane Founder", date: "2026-01-05", url: "https://example.com/a" },
    ]);
  });
  it("text with no URL is a label-only call; nothing is nothing", () => {
    expect(parseIntroCalls("Met at a conference", null)).toEqual([{ label: "Met at a conference" }]);
    expect(parseIntroCalls("", null)).toEqual([]);
    expect(parseIntroCalls(undefined, null)).toEqual([]);
  });
  it("trailing punctuation on a URL is not part of it", () => {
    expect(parseIntroCalls("Call: https://example.com/a.", null)[0].url).toBe("https://example.com/a");
  });
});

describe("deck (JC-NI-H)", () => {
  it("a deck URL becomes a deck citation on the first section (never a share URL)", () => {
    const d = draftOf(page(["Deck: https://docsend.example.com/view/abc"], `### Team\n\n${filler(300)}\n\n### Product\n\n${filler(40)}`));
    expect(d.deck).toEqual({ kind: "url", url: "https://docsend.example.com/view/abc" });
    expect(d.sections[0].citations).toEqual([{ label: "Deck", kind: "deck", url: "https://docsend.example.com/view/abc" }]);
    expect(d.sections[1].citations).toEqual([]);
  });
  it("a file path is skipped but recorded for the dry run", () => {
    const d = draftOf(page(["Deck: Acme%20Folder/deck.pdf"], filler(300)));
    expect(d.deck).toEqual({ kind: "file", path: "Acme%20Folder/deck.pdf" });
    expect(d.sections.flatMap((s) => s.citations)).toEqual([]);
  });
});

describe("a whole page", () => {
  it("warnings never contain body text (canary)", () => {
    const C = "CANARY-77aa";
    const text = page(["Decision: Maybe", "Source: Billboard", "URL: not a url"], `${C} <span>${C}</span>\n\n### Team\n\n<font>${C}</font> ${filler(300)}`, "Acme");
    const d = draftOf(text);
    expect(d.warnings.length).toBeGreaterThan(0);
    expect(d.warnings.join(" ")).not.toContain(C);
  });
  it("end to end: properties, sections, keys, share flags", () => {
    const text = page(
      ["Tags: Fintech", "Decision: Invested", "Intro Date: October 3, 2025", "Source: VC Intro", "URL: https://acme.example.com", "Last Edit: March 2, 2026 9:00 AM"],
      `### Overview\n\n${filler(300)}\n\n### Team\n\nJane Founder (CEO).\n\n### Team Thoughts\n\nInternal.`
    );
    const d = draftOf(text);
    expect(d).toMatchObject({ decision: "INVESTED", source: "VC Intro", tags: ["Fintech"], introDate: "2025-10-03", websiteUrl: "https://acme.example.com" });
    expect(d.sections.map((s) => [s.key, s.includeInShare])).toEqual([
      ["company-overview", true],
      ["team", true],
      ["team-thoughts", false],
    ]);
  });
});
