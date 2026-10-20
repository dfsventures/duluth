import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Part 40 (WS127): server-render smoke tests of the memo components that need no browser.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { SectionCard } from "@/components/admin/memos/section-card";
import { CitationChips } from "@/components/admin/memos/citation-chips";
import { CitationsEditor } from "@/components/admin/memos/citations-editor";
import type { MemoSectionView } from "@/components/admin/memos/types";

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
