import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// PLAN-1, WS163 (memo page). useNewLook is mocked so both looks render on the server.
const look = vi.hoisted(() => ({ v2: true }));
vi.mock("@/lib/use-new-look", () => ({ useNewLook: () => look.v2 }));
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

import { MemoHeader } from "@/components/admin/memos/memo-header";
import { SectionCard } from "@/components/admin/memos/section-card";
import type { MemoView } from "@/components/admin/memos/types";

const memo = {
  id: "m1",
  title: "Example Co",
  decision: "IN_PROGRESS",
  status: "DRAFT",
  version: 3,
  visibility: "PRIVATE",
  canEdit: true,
  canManage: true,
  owner: { name: "Sample Person", email: "sample@example.com" },
  updatedAt: "2026-11-01T10:00:00.000Z",
  importedFromNotion: false,
  draftedByMarge: true,
  companyRef: { kind: "pending", name: "Example Co" },
} as unknown as MemoView;

const noop = () => {};
const header = () => renderToStaticMarkup(<MemoHeader memo={memo} onOpenShare={noop} onArchive={noop} onChanged={noop} />);

describe("memo header", () => {
  it("new look: a back link to Memos replaces the breadcrumb, and Share is the one primary", () => {
    look.v2 = true;
    const html = header();
    expect(html).toContain('href="/admin/memos"');
    expect(html).not.toContain('aria-label="Breadcrumb"');
    // The Share button in the title row carries the primary style.
    expect(html).toContain("bg-primary text-primary-foreground");
    expect(html).toContain("</svg>Share</button>");
    // Print stays, as a secondary.
    expect(html).toContain("Print or save as PDF");
  });

  it("old look: the breadcrumb with the memo title and a secondary Share, as before", () => {
    look.v2 = false;
    const html = header();
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).not.toContain("bg-primary text-primary-foreground");
    expect(html).toContain("</svg>Share</button>");
  });

  it("keeps every control and fact in both looks", () => {
    for (const v2 of [true, false]) {
      look.v2 = v2;
      const html = header();
      for (const text of ["Owned by", "Updated", "Drafted by Marge", "Drafted with Marge", "Private", "Not linked", "Stage: Evaluating"]) {
        expect(html).toContain(text);
      }
      expect(html).toContain('id="memo-stage"');
      expect(html).toContain('id="memo-status"');
    }
  });

  it("print-only lines and the print scope hooks are not hidden by the new look", () => {
    look.v2 = true;
    const html = header();
    // The print summary line is hidden on screen and shown in print; v2 classes must not touch it.
    expect(html).toMatch(/class="mt-3 hidden text-sm print:block"/);
    expect(html).toMatch(/class="mt-1 hidden text-sm print:block"/);
  });
});

describe("section card", () => {
  const section = {
    key: "summary",
    title: "Summary",
    markdown: "Placeholder text",
    html: "<p>Placeholder text</p>",
    citations: [],
    includeInShare: true,
    version: 1,
    guidance: null,
  } as unknown as Parameters<typeof SectionCard>[0]["section"];

  it("keeps the section hook and gets the new-look classes", () => {
    look.v2 = true;
    const html = renderToStaticMarkup(<SectionCard memoId="m1" section={section} canEdit canManage onChanged={noop} />);
    expect(html).toContain('id="section-summary"');
    expect(html).toContain("memo-section");
    expect(html).toContain("v2:border-t-0");
    expect(html).toContain("text-heading");
  });

  it("old look: no fold, word count or hover actions; History and Edit stay plain buttons", () => {
    look.v2 = false;
    const html = renderToStaticMarkup(<SectionCard memoId="m1" section={section} canEdit canManage onChanged={noop} />);
    expect(html).not.toContain("data-folded");
    expect(html).not.toContain("memo-sact");
    expect(html).not.toContain("aria-expanded");
    expect(html).toContain('aria-label="History of Summary"');
    expect(html).toContain('aria-label="Edit Summary"');
    look.v2 = true;
  });
});

describe("new-look CSS", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

  it("the dossier layout rules are scoped to the admin new look and follow the container width", () => {
    const col = css.slice(css.indexOf("Memo page, direction B"), css.indexOf("Printing the memo in the dark theme"));
    expect(col).toContain("@media screen {");
    expect(col).toContain("@container (min-width: 1040px)");
    expect(col).toContain("grid-template-columns: minmax(0, 720px) 296px");
    expect(col).toContain("position: sticky");
    // The group (bar, column, panel) is 1056 wide at most and centred in the main area.
    expect(col).toMatch(/\.memo-dossier \{\s*max-width: 1056px;\s*margin-inline: max\(var\(--gutter\), calc\(\(100cqw - 1056px\) \/ 2\)\);/);
    expect(col).toMatch(/html\[data-look="v2"\] \[data-surface="admin"\] \.memo-dossier-grid/);
    // Fold and clamp rules sit in the screen block, so print always shows every section open.
    const screenBlock = col.slice(0, col.indexOf("@media screen and (hover: none)"));
    expect(screenBlock).toContain('[data-folded="true"]');
    expect(screenBlock).toContain('[data-clamped="true"]');
    // Hover reveal, and always shown without hover.
    expect(col).toContain(".memo-section:hover .memo-sact");
    expect(col).toContain("@media screen and (hover: none)");
  });

  it("printing puts light colour tokens back for the dark theme, inside the print scope only", () => {
    const print = css.slice(css.indexOf("Printing the memo in the dark theme"), css.indexOf("End new look"));
    expect(print).toContain("@media print {");
    expect(print).toMatch(/\[data-theme="dark"\] \[data-surface="admin"\] \.memo-print-scope \{[^}]*--color-text-primary: #15181D/);
    expect(print).toContain("--color-bg: #FFFFFF");
  });
});
