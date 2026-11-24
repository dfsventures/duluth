import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// B-175 (memo page, direction B "Dossier"). Placeholder data only.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/memos/m1",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { MemoDossier } from "@/components/admin/memos/memo-dossier";
import { firstSentence, relativeAge } from "@/components/admin/memos/dossier-utils";
import type { MemoView } from "@/components/admin/memos/types";

// A long section: it must show in full.
const long = Array.from({ length: 210 }, (_, i) => `word${i}`).join(" ");

function makeMemo(over: Partial<MemoView> = {}): MemoView {
  return {
    id: "m1",
    title: "Example Co",
    status: "DRAFT",
    visibility: "PRIVATE",
    draftedByMarge: true,
    importedFromNotion: false,
    decision: "IN_PROGRESS",
    source: "Partner event",
    tags: ["Fintech", "Seed"],
    introDate: "2026-10-14",
    websiteUrl: "https://example.com",
    round: null,
    ask: null,
    introCalls: [{ label: "Intro call", url: "https://example.com/call", date: "2026-10-06" }],
    version: 3,
    updatedAt: "2026-11-01T10:00:00.000Z",
    companyNamePending: "Example Co",
    company: null,
    companyRef: { kind: "pending", name: "Example Co" },
    owner: { id: "u1", name: "Sample Person", email: "sample@example.com" },
    sections: [
      { key: "summary", title: "Summary", markdown: "Short text. More.", html: "<p>Short text. More.</p>", citations: [], includeInShare: true, version: 1, guidance: null },
      { key: "market", title: "Market", markdown: long, html: `<p>${long}</p>`, citations: [], includeInShare: false, version: 1, guidance: null },
      { key: "team", title: "Team", markdown: "", html: "", citations: [], includeInShare: true, version: 1, guidance: "Who are the founders?" },
    ],
    canEdit: true,
    canManage: true,
    ...over,
  } as MemoView;
}

const noop = () => {};
const render = (memo = makeMemo()) =>
  renderToStaticMarkup(
    <MemoDossier memo={memo} linked={false} banner={<div>Banner here</div>} onOpenShare={noop} onArchive={noop} onChanged={noop} onEditDetails={noop} onChangeCompany={noop} />
  );

describe("dossier helpers", () => {
  it("takes the first sentence and trims long ones", () => {
    expect(firstSentence("**Bold** start. Second sentence.")).toBe("Bold start.");
    expect(firstSentence("")).toBe("");
    expect(firstSentence("x".repeat(300)).length).toBeLessThanOrEqual(140);
  });
  it("describes an intro date in plain relative words", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(relativeAge("2026-11-18", now)).toBe("today");
    expect(relativeAge("2026-11-17", now)).toBe("yesterday");
    expect(relativeAge("2026-11-10", now)).toBe("8 days ago");
    expect(relativeAge("2026-10-14", now)).toBe("5 weeks ago");
    expect(relativeAge("2026-07-18", now)).toBe("4 months ago");
    expect(relativeAge("2024-11-18", now)).toBe("2 years ago");
  });
});

describe("dossier layout", () => {
  it("has the panel with every fact, the contents list and the grid hooks", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
    const html = render();
    vi.useRealTimers();
    expect(html).toContain('aria-label="Deal facts"');
    expect(html).toContain("memo-dossier-grid");
    for (const text of ["Access", "Private", "Partner event", "Intro", "5 weeks ago", "example.com", "Fintech", "Intro calls", "Contents"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('aria-label="Stage: Evaluating"');
    expect(html).toContain('aria-label="Memo status: Draft"');
    // Contents entries and the phone's Jump to.
    expect(html).toContain('href="#section-market"');
    expect(html).toContain('id="memo-jump"');
    // The intro text may wrap inside the panel (the mockup's "5 weeks ago" overflow): values break, never nowrap.
    const panel = html.slice(html.indexOf('aria-label="Deal facts"'), html.indexOf('aria-label="Sections"'));
    expect(panel.includes("whitespace-nowrap")).toBe(false);
    expect(panel.includes("min-w-0 break-words")).toBe(true);
  });

  it("keeps every old action reachable", () => {
    const html = render();
    for (const text of ["Share", "Edit details", "Link to company", "Print or save as PDF", "Archive memo", "Banner here", "Drafted by Marge", "Drafted with Marge", "Hidden from share links"]) {
      // The ⋯ menu items render only when open; the foot Archive button and the others are in the markup.
      if (["Edit details", "Link to company", "Print or save as PDF"].includes(text)) continue;
      expect(html).toContain(text);
    }
    expect(html).toContain('aria-label="More actions"');
    expect(html).toContain('aria-label="History of Summary"');
    expect(html).toContain('aria-label="Edit Summary"');
    expect(html).toContain("Stage: Evaluating · Memo status: Draft");
  });

  it("does not show placeholders for Round and Ask", () => {
    const html = render();
    expect(html).not.toContain("Round");
    expect(html).not.toContain(">Ask<");
  });

  it("B-176: shows Round and Ask as panel rows (and print lines) when set, in that order after Access", () => {
    const html = render(makeMemo({ round: "Seed", ask: "$X on a SAFE" }));
    const panel = html.slice(html.indexOf('aria-label="Deal facts"'), html.indexOf('aria-label="Sections"'));
    expect(panel).toContain('<dt class="pt-0.5 text-meta text-muted-foreground">Round</dt><dd class="min-w-0 break-words">Seed</dd>');
    expect(panel).toContain('<dt class="pt-0.5 text-meta text-muted-foreground">Ask</dt><dd class="min-w-0 break-words">$X on a SAFE</dd>');
    expect(panel.indexOf(">Access<")).toBeLessThan(panel.indexOf(">Round<"));
    expect(panel.indexOf(">Round<")).toBeLessThan(panel.indexOf(">Ask<"));
    expect(panel.indexOf(">Ask<")).toBeLessThan(panel.indexOf(">Source<"));
    expect(html).toContain("<dt>Round</dt><dd>Seed</dd>");
    expect(html).toContain("<dt>Ask</dt><dd>$X on a SAFE</dd>");
  });

  it("B-176: shows only the one that is set", () => {
    const html = render(makeMemo({ round: null, ask: "$X" }));
    expect(html).not.toContain(">Round<");
    expect(html).toContain(">Ask<");
  });

  it("has no left-edge bar on the contents list, and marks the active section with an underscore", () => {
    const html = render();
    expect(html).not.toContain("border-l-2");
    expect(html).toContain("bg-mark");
  });

  it("sections open unfolded and in full: a chevron folds one, with no clamp, word count or fold-all", () => {
    const html = render();
    expect(html).toContain('data-folded="false"');
    expect(html).not.toContain('data-folded="true"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(long);
    for (const gone of ["data-clamped", "Show all", "Show less", "memo-more", "Unfold all", "Fold all"]) {
      expect(html.includes(gone), gone).toBe(false);
    }
    expect(html).not.toMatch(/\d words?</);
  });

  it("controls and panel stay off paper; the Stage/Status line and facts print", () => {
    const html = render();
    expect(html).toMatch(/<aside[^>]*memo-aside memo-no-print/);
    expect(html).toContain("print:block");
    // Print-only facts list
    expect(html).toContain("print:grid");
    expect(html).toContain("Intro date");
  });

  it("read-only people see the chips without menus and no Edit", () => {
    const html = render(makeMemo({ canEdit: false, canManage: false }));
    expect(html).not.toContain('aria-label="Stage: Evaluating"');
    expect(html).toContain("Evaluating");
    expect(html).not.toContain('aria-label="Edit Summary"');
    expect(html).toContain('aria-label="History of Summary"');
    expect(html).not.toContain("Archive memo");
  });

  it("leaves out facts the memo does not have", () => {
    const html = render(makeMemo({ source: null, introDate: null, websiteUrl: null, tags: [], introCalls: [] }));
    expect(html).not.toContain("Source");
    expect(html).not.toContain("Website");
    expect(html).not.toContain("Tags");
    expect(html).not.toContain("Intro calls");
  });
});
