import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Part 40 (WS127): server-render smoke tests of the memo components that need no browser.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { SectionCard } from "@/components/admin/memos/section-card";
import { CitationChips } from "@/components/admin/memos/citation-chips";
import { CitationsEditor } from "@/components/admin/memos/citations-editor";
import { MemoBoardCard } from "@/components/admin/memos/memo-board-card";
import { MemoBoard } from "@/components/admin/memos/memo-board";
import type { MemoRow, MemoSectionView } from "@/components/admin/memos/types";

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
    expect(render(section({ includeInShare: false }))).toContain("Not in share links");
    const empty = render(section({ html: "", markdown: "", citations: [] }));
    expect(empty).toContain("No text yet.");
    expect(empty).toContain("Founders and key hires.");
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
