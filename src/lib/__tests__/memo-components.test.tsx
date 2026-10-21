import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Part 40 (WS127): server-render smoke tests of the memo components that need no browser.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { SectionCard } from "@/components/admin/memos/section-card";
import { CitationChips } from "@/components/admin/memos/citation-chips";
import { CitationsEditor } from "@/components/admin/memos/citations-editor";
import { MemoBoardCard } from "@/components/admin/memos/memo-board-card";
import { MemoBoard } from "@/components/admin/memos/memo-board";
import { MemoDetails } from "@/components/admin/memos/memo-details";
import { SectionNav } from "@/components/admin/memos/section-nav";
import { MemoHeader } from "@/components/admin/memos/memo-header";
import type { MemoRow, MemoSectionView, MemoView } from "@/components/admin/memos/types";

const section = (over: Partial<MemoSectionView> = {}): MemoSectionView => ({
  key: "team",
  title: "Team",
  markdown: "Jane Founder",
  html: "<p>Jane Founder</p>",
  citations: [{ label: "Intro call", kind: "call", date: "2026-10-01" }],
  includeInShare: true,
  version: 3,
  guidance: "Founders and key hires.",
  ...over,
});
const render = (s: MemoSectionView, canEdit = true, canManage = true) =>
  renderToStaticMarkup(<SectionCard memoId="m1" section={s} canEdit={canEdit} canManage={canManage} onChanged={() => {}} />);

describe("SectionCard", () => {
  it("shows the server-rendered text, a citation chip and Edit and History controls", () => {
    const html = render(section());
    expect(html).toContain('id="section-team"');
    expect(html).toContain("<p>Jane Founder</p>");
    expect(html).toContain("Intro call");
    expect(html).toContain("Oct 1, 2026");
    expect(html).toContain('aria-label="Edit Team"');
    expect(html).toContain('aria-label="History of Team"');
  });
  it("read-only readers get History but no Edit", () => {
    const html = render(section(), false, false);
    expect(html).not.toContain('aria-label="Edit Team"');
    expect(html).toContain('aria-label="History of Team"');
  });
  it("marks a section left out of share links, and shows the guidance while empty", () => {
    expect(render(section({ includeInShare: false }))).toContain("Hidden from share links");
    expect(render(section({ includeInShare: false }))).not.toContain("Not in share links");
    const empty = render(section({ html: "", markdown: "", citations: [] }));
    expect(empty).toContain("No text yet.");
    expect(empty).toContain("Founders and key hires.");
  });
});

describe("SectionCard share hint (Part 44)", () => {
  const withShare = (onOpenShare?: () => void) =>
    renderToStaticMarkup(
      <SectionCard memoId="m1" section={section({ includeInShare: false })} canEdit canManage onChanged={() => {}} onOpenShare={onOpenShare} />
    );
  it("is a button with onOpenShare and a plain span without", () => {
    const btn = withShare(() => {});
    expect(btn).toMatch(/<button[^>]*title="Left out of share links/);
    const span = withShare();
    expect(span).toContain("<span class=\"memo-no-print inline-flex");
    expect(span).not.toMatch(/<button[^>]*title="Left out/);
  });
});

describe("citations", () => {
  it("chips link out only for a URL, with rel noopener", () => {
    const html = renderToStaticMarkup(
      <CitationChips citations={[{ label: "Press", kind: "web", url: "https://example.com/a" }, { label: "Deck", kind: "deck" }]} />
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(CitationChips({ citations: [] })).toBeNull();
  });
  it("the editor lists the kinds and caps nothing it should not", () => {
    const html = renderToStaticMarkup(<CitationsEditor value={[{ label: "x", kind: "call" }]} onChange={() => {}} />);
    for (const k of ["Call", "Deck", "Tracker", "Web", "Other"]) expect(html).toContain(`>${k}<`);
    expect(html).toContain("Add citation");
    const full = renderToStaticMarkup(<CitationsEditor value={Array(20).fill({ label: "x", kind: "call" })} onChange={() => {}} />);
    expect(full).not.toContain("Add citation");
  });
});

// Part 43 (WS142): the memo board. Names are placeholders.
const memoRow = (over: Partial<MemoRow> = {}): MemoRow => ({
  id: "m1",
  title: "Acme",
  companyId: null,
  companyNamePending: null,
  status: "DRAFT",
  visibility: "TEAM",
  draftedByMarge: false,
  decision: "MEMO",
  tags: [],
  version: 1,
  updatedAt: "2026-10-01T10:00:00.000Z",
  company: null,
  companyRef: { kind: "none" } as MemoRow["companyRef"],
  owner: { id: "u1", name: "Sam Example", email: "sam@example.com" },
  canEdit: true,
  ...over,
});
const card = (m: MemoRow, desktop: boolean, showOwner = true) =>
  renderToStaticMarkup(<MemoBoardCard memo={m} me="u1" desktop={desktop} showOwner={showOwner} onMoveTo={() => {}} />);
const board = (rows: MemoRow[]) => renderToStaticMarkup(<MemoBoard rows={rows} me="u1" showOwner onMove={() => {}} />);

describe("MemoBoardCard", () => {
  it("editable on desktop is draggable and has a menu trigger naming the memo", () => {
    const html = card(memoRow(), true);
    expect(html).toContain('draggable="true"');
    expect(html).toContain('aria-label="Actions for &quot;Acme&quot;"');
    expect(html).toContain('href="/admin/memos/m1"');
  });
  it("read-only is not draggable and has no Move to", () => {
    const html = card(memoRow({ canEdit: false }), true);
    expect(html).not.toContain('draggable="true"');
    expect(html).not.toContain("Move to");
    expect(card(memoRow({ canEdit: false }), false)).not.toContain("Move to");
  });
  it("phone has a menu trigger and no select; not draggable", () => {
    const html = card(memoRow(), false);
    expect(html).not.toContain('draggable="true"');
    expect(html).toContain('aria-label="Actions for &quot;Acme&quot;"');
    expect(html).not.toContain("<select");
  });
  it("a pending company shows the quiet Not linked icon; none reads No company", () => {
    const html = card(memoRow({ companyRef: { kind: "pending", name: "Globex" } as MemoRow["companyRef"] }), true);
    expect(html).toContain('title="Not linked"');
    expect(html).not.toContain("<span class=\"inline-flex");
    expect(card(memoRow(), true)).toContain("No company");
  });
  it("tags render as one line, two shown and +2", () => {
    const html = card(memoRow({ tags: ["a1", "b2", "c3", "d4"] }), true);
    expect(html).toContain("a1 · b2");
    expect(html).toContain("+2");
    expect(html).not.toContain(">c3<");
    expect(html).toContain('title="a1, b2, c3, d4"');
  });
  it("the owner chip shows real initials, with You only in the label", () => {
    const html = card(memoRow(), true);
    expect(html).toContain('aria-label="Owner: You"');
    expect(html).toContain(">SE<");
    expect(html).not.toContain(">Y<");
    expect(renderToStaticMarkup(<MemoBoardCard memo={memoRow()} me="u2" desktop showOwner onMoveTo={() => {}} />)).toContain("Owner: Sam Example");
  });
  it("showOwner false renders no owner chip", () => {
    expect(card(memoRow(), true, false)).not.toContain("Owner:");
  });
  it("the company line is hidden when it equals the title, shown when different", () => {
    const same = card(memoRow({ companyRef: { kind: "company", id: "c1", name: "ACME" } as MemoRow["companyRef"] }), true);
    expect(same).not.toContain(">ACME<");
    expect(same).not.toContain("No company");
    const other = card(memoRow({ companyRef: { kind: "company", id: "c1", name: "Globex" } as MemoRow["companyRef"] }), true);
    expect(other).toContain("Globex");
  });
  it("Final shows only a screen-reader label; Draft shows its word", () => {
    const final = card(memoRow({ status: "FINAL" }), true);
    expect(final).toContain('sr-only">Final<');
    expect(final.replace(/<span class="sr-only">Final<\/span>/, "")).not.toContain("Final");
    expect(card(memoRow({ status: "DRAFT" }), true)).toContain("Draft");
  });
  it("an Evaluating or Writing memo card untouched for 20 days is idle; others never", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-21T10:00:00.000Z"));
      expect(card(memoRow({ updatedAt: "2026-10-01T10:00:00.000Z" }), true)).toContain("Idle · 2 wk ago");
      expect(card(memoRow({ updatedAt: "2026-10-01T10:00:00.000Z", decision: "INVESTED" }), true)).not.toContain("Idle");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("MemoBoard", () => {
  it("a Passed row shows the collapsed rail and no card markup until expanded", () => {
    const html = board([memoRow({ id: "m2", title: "Globex", decision: "MEMO" }), memoRow({ id: "p1", title: "Initech", decision: "PASSED" })]);
    expect(html).toContain('aria-label="Show Passed, 1 memo"');
    expect(html).toContain('title="Show 1 passed"');
    expect(html).not.toContain("Initech");
  });
  it("an empty Unsorted column is a rail", () => {
    const html = board([memoRow()]);
    expect(html).toContain('aria-label="Show Unsorted, 0 memos"');
    expect(html).toContain('title="Unsorted: no memos"');
  });
  it("on a phone only the first non-empty section is open", () => {
    const html = board([memoRow({ id: "a", title: "Acme", decision: "MEMO" }), memoRow({ id: "b", title: "Globex", decision: "LATER" })]);
    expect(html.match(/<details[^>]* open/g)).toHaveLength(1);
  });
});

// Part 44 (WS146): the memo page pieces. Placeholder names only.
const memoView = (over: Partial<MemoView> = {}): MemoView => ({
  id: "m1",
  title: "Acme",
  status: "FINAL",
  visibility: "TEAM",
  draftedByMarge: false,
  importedFromNotion: false,
  decision: "MEMO",
  source: null,
  tags: [],
  introDate: null,
  websiteUrl: null,
  introCalls: [],
  version: 1,
  updatedAt: "2026-10-01T10:00:00.000Z",
  companyNamePending: null,
  company: null,
  companyRef: { kind: "none" } as MemoView["companyRef"],
  owner: { id: "u1", name: "Sam Example", email: "sam@example.com" },
  sections: [],
  canEdit: true,
  canManage: true,
  ...over,
});
const details = (m: MemoView) => renderToStaticMarkup(<MemoDetails memo={m} linked={false} onEditDetails={() => {}} onChangeCompany={() => {}} />);

describe("MemoDetails", () => {
  it("has no Stage row, and tags are plain text", () => {
    const html = details(memoView({ source: "Founder Intro", tags: ["AI", "Payments"] }));
    expect(html).not.toContain("Stage");
    expect(html).not.toContain("Decision");
    expect(html).toContain("AI, Payments");
    expect(html).not.toContain("bg-tone");
  });
  it("is collapsed with 3 or more filled fields and open with 2", () => {
    const three = details(memoView({ source: "Founder Intro", introDate: "2026-08-10", tags: ["AI"] }));
    expect(three).toContain('aria-expanded="false"');
    expect(three).toMatch(/<dl id="memo-details-body" class="[^"]*\bhidden print:grid/);
    const two = details(memoView({ source: "Founder Intro", tags: ["AI"] }));
    expect(two).toContain('aria-expanded="true"');
    expect(two).not.toMatch(/<dl[^>]*\bhidden print:grid/);
  });
  it("the owner gets the Edit menu; an editor gets a plain Edit button and no Change company", () => {
    const owner = details(memoView({ source: "x" }));
    expect(owner).toContain("Edit");
    expect(owner).toContain('aria-haspopup="menu"');
    const editor = renderToStaticMarkup(
      <MemoDetails memo={memoView({ source: "x", canManage: false })} linked={false} onEditDetails={() => {}} onChangeCompany={() => {}} />
    );
    expect(editor).toContain("Edit");
    expect(editor).not.toContain('aria-haspopup="menu"');
    expect(editor).not.toContain("Change company");
    expect(editor).not.toContain("Link to company");
  });
});

describe("SectionNav", () => {
  it("marks the first section current and lists a Jump to select", () => {
    const html = renderToStaticMarkup(<SectionNav sections={[{ key: "team", title: "Team" }, { key: "market", title: "Market" }]} />);
    expect(html).toMatch(/href="#section-team"[^>]*aria-current="location"|aria-current="location"[^>]*href="#section-team"/);
    expect(html).not.toMatch(/href="#section-market"[^>]*aria-current/);
    const select = html.slice(html.indexOf('<select id="memo-jump"'), html.indexOf("</select>"));
    expect(select).toBeTruthy();
    expect((select.match(/<option/g) ?? []).length).toBe(2);
  });
});

describe("MemoHeader", () => {
  const header = (m: MemoView) => renderToStaticMarkup(<MemoHeader memo={m} onOpenShare={() => {}} onArchive={() => {}} onChanged={() => {}} />);
  it("shows Stage only in its select and prints it as text", () => {
    const html = header(memoView());
    expect(html).toContain('id="memo-stage"');
    expect(html).toContain('id="memo-status"');
    expect(html).not.toContain("<span class=\"inline-flex items-center rounded");
    expect(html).toContain("Stage: Writing memo · Memo status: Final");
  });
  it("the facts line says From Notion, not the old sentence", () => {
    const html = header(memoView({ importedFromNotion: true }));
    expect(html).toContain("From Notion");
    expect(html).not.toContain("Imported from Notion.");
    expect(html).toContain("Owned by Sam Example");
  });
  it("hides the company name when it equals the title but keeps an icon link", () => {
    const html = header(memoView({ companyRef: { kind: "company", id: "c1", name: "Acme" } as MemoView["companyRef"] }));
    expect(html).toContain('aria-label="Open Acme in Molly"');
    expect(html).not.toContain('class="text-primary underline-offset-4 hover:underline"');
    const other = header(memoView({ companyRef: { kind: "company", id: "c1", name: "Globex" } as MemoView["companyRef"] }));
    expect(other).toContain("Globex");
    expect(other).not.toContain("Open Globex in Molly");
  });
  it("a read-only viewer has no Stage select", () => {
    const html = header(memoView({ canEdit: false, canManage: false }));
    expect(html).not.toContain("<select");
  });
});
