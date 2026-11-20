import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { join } from "path";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import tailwindConfig from "../../../tailwind.config";

// PLAN-1, WS158. The shell's new look is decided by CSS (a `v2:` variant), so the markup is
// identical in both looks. These tests pin the parts that must not drift.

const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf-8");

describe("v2 variants", () => {
  it("only match admin pages while the switch is on", () => {
    const src = read("../tailwind.config.ts");
    expect(src).toContain(`addVariant("v2", 'html[data-look="v2"] [data-surface="admin"] &')`);
    expect(src).toContain(`[data-theme="dark"] [data-surface="admin"] &'`);
    expect(tailwindConfig.plugins?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("PageHeader", () => {
  it("keeps one h1 and the description and action", () => {
    const html = renderToStaticMarkup(<PageHeader title="Companies" description="Everyone we back" action={<button>Add</button>} />);
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain("Companies");
    expect(html).toContain("Everyone we back");
    expect(html).toContain("<button>Add</button>");
    // Page types v1: an in-page header (not the sticky bar), with the marks the alignment check reads.
    expect(html).not.toContain("shell-header");
    expect(html).toContain('data-page-head=""');
    expect(html).toContain('data-align="title"');
    expect(html).toContain('data-align="desc"');
    expect(html).toContain('data-align="actions"');
    expect(html).toContain("v2:text-page-title");
  });
  it("back goes on its own line above the title, new look only; status only under the new look", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Acme" back={{ href: "/admin/companies", label: "Companies" }} status={<span>Active</span>} />
    );
    // The back link sits in its own full-width row, drawn only under the new look.
    expect(html).toMatch(/<div class="page-back-row hidden v2:block"><a [^>]*data-align="back"[^>]*class="page-back/);
    expect(html.indexOf('data-align="back"')).toBeLessThan(html.indexOf("<h1"));
    expect(html).toMatch(/data-align="desc" class="hidden v2:mt-1 v2:flex/);
  });
  it("secondaryActions: desktop buttons plus a 'More actions' menu button that only shows on phones; the primary action stays", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Companies"
        action={<button>Add Company</button>}
        secondaryActions={[
          { label: "CSV format", onSelect: () => {} },
          { label: "Import CSV", onSelect: () => {} },
        ]}
      />
    );
    expect(html).toContain('aria-label="More actions"');
    expect(html).toContain("max-md:v2:hidden");
    expect(html).toContain("hidden max-md:v2:block");
    expect(html).toContain("CSV format");
    expect(html).toContain("<button>Add Company</button>");
  });
  it("without secondaryActions there is no menu", () => {
    const html = renderToStaticMarkup(<PageHeader title="Companies" action={<button>Add</button>} />);
    expect(html).not.toContain("More actions");
  });
  it("omits the description and action when absent", () => {
    const html = renderToStaticMarkup(<PageHeader title="Audit log" />);
    expect(html).not.toContain("<p");
  });
});

describe("shell source", () => {
  const shell = read("components/layout/app-shell.tsx");
  const sidebar = read("components/layout/sidebar.tsx");
  it("AppShell takes a width prop that defaults to the old column", () => {
    expect(shell).toContain('width = "page"');
    expect(shell).toContain("max-w-6xl px-4 py-6 md:px-6 md:py-8");
    // Page types v1: "full" no longer drops the frame; every width is the same centred frame.
    expect(shell).not.toContain("v2:max-w-none");
    expect(shell).toContain("v2:pb-24 v2:pt-10");
    expect(shell).toContain('data-condensed-slot=""');
  });
  it("one page frame: centred, a gutter each side, --frame per width, header bar on the same column", () => {
    expect(shell).toContain('"page" | "narrow" | "wide" | "full" | "detail" | "detail-wide"');
    expect(read("app/globals.css")).toMatch(/\.shell-page\[data-width="narrow"\] \{\s*--frame: var\(--column-narrow\);/);
    // Editors, forms and Settings share one narrow column with their header bar.
    // Settings moved to the "detail" frame in the admin audit (left rail of sections beside a 720 column).
    expect(read("app/admin/settings/page.tsx")).toContain('<AppShell width="detail">');
    for (const f of ["app/admin/broadcasts/[id]/page.tsx", "app/admin/reports/[id]/page.tsx", "app/admin/digest/[id]/page.tsx", "app/admin/companies/new/page.tsx"]) {
      expect(read(f)).toContain('<AppShell width="narrow">');
    }
    expect(shell).toContain("v2:mx-auto v2:max-w-[calc(var(--frame)+2*var(--gutter))] v2:px-[var(--gutter)]");
    const css = read("app/globals.css");
    expect(css).toContain("--column-wide: 1296px;"); // page types v1, question 1: lists capped at 1296, centred
    expect(css).toContain("--column-detail: 1056px;");
    expect(css).toContain("--column-detail-wide: 1296px;");
    // Gutter: 20 phone, 24 tablet, 48 from 1024, 64 from 1600.
    expect(css).toMatch(/@media \(min-width: 1024px\) \{[^@]*--gutter: 48px;/);
    expect(css).toMatch(/@media \(min-width: 1600px\) \{[^@]*--gutter: 64px;/);
    expect(css).toContain("--frame-off: max(0px, calc((100cqw - var(--frame) - 2 * var(--gutter)) / 2));");
    expect(css).toMatch(/\.shell-page\[data-width="detail-wide"\] \{\s*--frame: var\(--column-detail-wide\);/);
    // The header's margins and padding come from the same two numbers, so its right edge is the content's.
    expect(css).toMatch(
      /margin-left: calc\(\(var\(--frame-off\) \+ var\(--page-pad\)\) \* -1\);\s*margin-right: calc\(\(var\(--frame-off\) \+ var\(--page-pad\)\) \* -1\);\s*padding-left: calc\(var\(--frame-off\) \+ var\(--gutter\)\);\s*padding-right: calc\(var\(--frame-off\) \+ var\(--gutter\)\);/
    );
    // No page keeps a second centring mechanism.
    expect(css).not.toMatch(/margin-inline: max\(var\(--gutter\), calc\(\(100cqw/);
    // The Deal Ledger passes "wide"; the Dossier pages pass "detail" (fund: "detail-wide").
    expect(read("app/admin/portfolio/page.tsx")).toContain('<AppShell width="wide">');
    expect(read("app/admin/funds/[id]/page.tsx")).toContain('<AppShell width="detail-wide">');
    expect(read("app/admin/companies/[id]/page.tsx")).toContain('<AppShell width="detail">');
    expect(read("app/admin/portfolio/[id]/page.tsx")).toContain('<AppShell width="detail">');
    expect(read("app/admin/memos/[id]/memo-client.tsx")).toContain('<AppShell width="detail">');
    expect(read("app/admin/settings/page.tsx")).not.toContain('width="wide"');
  });
  it("has landmarks: labelled sidebar and nav, one main, a skip link to it", () => {
    expect(sidebar).toContain('aria-label="Sidebar"');
    expect(sidebar).toContain('aria-label="Main"');
    expect(shell).toContain("<main id={MAIN_ID}");
    expect(shell).toContain("skip-link");
  });
  it("sidebar keeps the switch, with both labels present and the theme item", () => {
    expect(sidebar).toContain("Try the new look");
    expect(sidebar).toContain("Use the old look");
    expect(sidebar).toContain("Switch to dark mode");
  });
  it("sidebar is 224px, items 32px (44px on phones) with no left rule under the new look", () => {
    expect(sidebar).toContain("v2:w-56");
    expect(sidebar).toContain("v2:h-8");
    expect(sidebar).toContain("v2:h-9 v2:rounded"); // search row 36px
    expect(sidebar).toContain("v2:pt-6"); // 24px above a group heading
    expect(sidebar).toContain("max-md:v2:h-11");
    expect(sidebar).toContain("v2:before:hidden");
  });
  it("only needs-you counts are bold under the new look", () => {
    expect(sidebar).toContain('marker.solid ? "v2:font-semibold v2:text-foreground" : "v2:font-normal v2:text-muted-foreground"');
  });
});

describe("shell css", () => {
  const css = read("app/globals.css");
  const start = css.indexOf("/* App shell (PLAN-1, WS158)");
  // The shell rules end where the WS159 component rules begin (those use ::before for badge glyphs).
  const end = css.indexOf("/* Core components (PLAN-1, WS159)");
  it("sits inside the new-look section", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });
  it("has no left-edge bars", () => {
    expect(css.slice(start, end)).not.toMatch(/border-left|inset-y|::before/);
  });
});

describe("FilterBar", () => {
  const noop = () => {};
  it("shows unset chips dashed with a plus and no Clear filters", () => {
    const html = renderToStaticMarkup(
      <FilterBar chips={[{ key: "owner", label: "Owner" }]} onOpen={noop} onRemove={noop} onClearAll={noop} />
    );
    expect(html).toContain("border-dashed");
    expect(html).not.toContain("Clear filters");
  });
  it("every control is 36 (44 on phones); the row wraps and has 8px of background above and below", () => {
    const html = renderToStaticMarkup(
      <FilterBar chips={[{ key: "owner", label: "Owner" }]} onOpen={noop} onRemove={noop} onClearAll={noop} />
    );
    expect(html).toContain("h-9 max-md:h-11");
    expect(html).toContain("flex-wrap");
    expect(html).toContain("py-2");
    expect(html).toContain('data-align="filters"');
  });
  it("segmented: one choice drawn as one radiogroup, the picked segment checked", () => {
    const html = renderToStaticMarkup(
      <FilterBar
        segmented
        chips={[
          { key: "all", label: "All", plain: true },
          { key: "behind", label: "Behind", set: true, count: 2 },
        ]}
        onOpen={noop}
        onRemove={noop}
        onClearAll={noop}
      />
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain("Remove Behind filter");
  });
  it("filters sit in the left group; the right end holds only what is passed as trailing", () => {
    const html = renderToStaticMarkup(
      <FilterBar chips={[]} onOpen={noop} onRemove={noop} onClearAll={noop} filters={<select aria-label="Fund" />} trailing={<span>4 funds</span>} />
    );
    expect(html.indexOf('aria-label="Fund"')).toBeLessThan(html.indexOf("ml-auto"));
    expect(html).toContain('data-align="filters-end"');
  });
  it("is positioned, so hidden labels inside it cannot widen the page past a phone screen", () => {
    const html = renderToStaticMarkup(
      <FilterBar
        chips={[{ key: "owner", label: "Owner" }]}
        onOpen={noop}
        onRemove={noop}
        onClearAll={noop}
        trailing={<label className="sr-only">Fund</label>}
      />
    );
    expect(html).toMatch(/class="filter-row relative /);
  });
  it("shows a set chip with its value, a remove button and Clear filters (copy doc: not Clear all)", () => {
    const html = renderToStaticMarkup(
      <FilterBar chips={[{ key: "owner", label: "Owner", value: "Sam Admin" }]} onOpen={noop} onRemove={noop} onClearAll={noop} />
    );
    expect(html).toContain("Sam Admin");
    expect(html).toContain('aria-label="Remove Owner filter"');
    expect(html).toContain("Clear filters");
    expect(html).not.toContain("Clear all");
  });
  it("a single-choice chip is set by `set`, shows its count, and is announced as pressed", () => {
    const html = renderToStaticMarkup(
      <FilterBar
        chips={[
          { key: "behind", label: "Behind", set: true, count: 2 },
          { key: "aging", label: "Aging", count: 1 },
        ]}
        onOpen={noop}
        onRemove={noop}
        onClearAll={noop}
      />
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Remove Behind filter"');
    expect(html).not.toContain('aria-label="Remove Aging filter"');
  });
});
