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
const card = (m: MemoRow, desktop: boolean) =>
  renderToStaticMarkup(<MemoBoardCard memo={m} me="u1" desktop={desktop} onMoveTo={() => {}} />);

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
  it("phone has the select with the five other columns and not its own", () => {
    const html = card(memoRow(), false);
    expect(html).not.toContain('draggable="true"');
    const select = html.slice(html.indexOf("<select"), html.indexOf("</select>"));
    for (const label of ["In Progress", "Invested", "Later", "Passed", "No decision"]) expect(select).toContain(`>${label}<`);
    expect(select).not.toContain('value="MEMO"');
    expect((select.match(/<option/g) ?? []).length).toBe(6); // placeholder + five
  });
  it("a pending company shows Not linked; none reads No company", () => {
    expect(card(memoRow({ companyRef: { kind: "pending", name: "Globex" } as MemoRow["companyRef"] }), true)).toContain("Not linked");
    expect(card(memoRow(), true)).toContain("No company");
  });
  it("four tags render three chips and +1", () => {
    const html = card(memoRow({ tags: ["a1", "b2", "c3", "d4"] }), true);
    expect(html).toContain("a1");
    expect(html).toContain("c3");
    expect(html).not.toContain(">d4<");
    expect(html).toContain("+1");
  });
  it("the owner reads You for me", () => {
    expect(card(memoRow(), true)).toContain('aria-label="Owner: You"');
    expect(renderToStaticMarkup(<MemoBoardCard memo={memoRow()} me="u2" desktop onMoveTo={() => {}} />)).toContain("Owner: Sam Example");
  });
});

describe("MemoBoard", () => {
  it("a Passed row shows the collapsed rail and no card markup until expanded", () => {
    const html = renderToStaticMarkup(<MemoBoard rows={[memoRow({ id: "p1", title: "Initech", decision: "PASSED" })]} me="u1" onMove={() => {}} />);
    expect(html).toContain('aria-label="Show Passed, 1 memo"');
    expect(html).not.toContain("Initech");
  });
  it("an empty No decision column is present with a zero count", () => {
    const html = renderToStaticMarkup(<MemoBoard rows={[memoRow()]} me="u1" onMove={() => {}} />);
    expect(html).toContain("No decision");
    expect(html).toContain('aria-label="0 memos"');
  });
});
