import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { join } from "path";

// PLAN-1, WS160. The new look's list and pane. useNewLook is mocked so both looks can be rendered
// on the server (the real hook reads localStorage after hydration).
const look = vi.hoisted(() => ({ v2: true }));
vi.mock("@/lib/use-new-look", () => ({ useNewLook: () => look.v2 }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/companies",
  useSearchParams: () => new URLSearchParams("filter=behind"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { SplitView } from "@/components/layout/split-view";
import { DetailPane, PaneCard, PaneChip, PaneSection } from "@/components/layout/detail-pane";
import { companyNextAction } from "@/lib/company-pane";

interface Row {
  id: string;
  name: string;
  status: string;
  members: number;
}
const rows: Row[] = [
  { id: "c1", name: "Acme", status: "Behind", members: 2 },
  { id: "c2", name: "Example Co", status: "Behind", members: 1 },
  { id: "c3", name: "Sample Labs", status: "Current", members: 4 },
];
const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Company", sortValue: (r) => r.name, cell: (r) => r.name },
  { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => r.status },
  { key: "members", header: "Members", align: "num", dropBelow: 600, sortValue: (r) => r.members, cell: (r) => r.members },
];
const base = {
  label: "Companies",
  noun: "company",
  pluralNoun: "companies",
  rows,
  rowKey: (r: Row) => r.id,
  columns,
  defaultSort: { key: "name", dir: "asc" as const },
  empty: null,
  rowHref: (r: Row) => `/admin/companies/${r.id}`,
  searchText: (r: Row) => [r.name],
  chips: [{ key: "behind", label: "Behind", test: (r: Row) => r.status === "Behind" }],
};

describe("DataTable under the new look", () => {
  look.v2 = true;
  const html = renderToStaticMarkup(<DataTable<Row> {...base} onOpenRow={() => {}} openKey="c2" />);

  it("marks the wrapper with the density and list mode", () => {
    expect(html).toContain('data-density="comfortable"');
    expect(html).toContain("data-list-mode");
  });
  it("takes density compact", () => {
    expect(renderToStaticMarkup(<DataTable<Row> {...base} density="compact" />)).toContain('data-density="compact"');
  });
  it("is not in list mode without onOpenRow", () => {
    const plain = renderToStaticMarkup(<DataTable<Row> {...base} />);
    expect(plain).toContain('data-density="comfortable"');
    expect(plain).not.toContain("data-list-mode");
    expect(plain).not.toContain('role="option"');
  });
  it("announces rows as options with aria-selected, and marks the open one", () => {
    expect(html).toContain('role="listbox"');
    expect((html.match(/role="option"/g) ?? []).length).toBeGreaterThanOrEqual(3); // desktop rows (the filter shows 2; mobile adds 2 more)
    expect(html).toMatch(/aria-selected="true"[^>]*data-key="c2"[^>]*data-open="true"/);
    expect(html).toMatch(/aria-selected="false"[^>]*data-key="c1"/);
  });
  it("tags droppable columns, and never the first", () => {
    expect(html).toContain('data-drop="600"');
    expect(html).not.toMatch(/<(td|th)[^>]*data-drop[^>]*>Acme/);
  });
  it("uses the filter bar: single-choice chips, the picked one set, Clear filters while filtered", () => {
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Remove Behind filter"');
    expect(html).toContain("Clear filters");
    expect(html).toContain("sticky top-[var(--bar-h)]");
  });
  it("filters out the row that does not match the chip", () => {
    expect(html).not.toContain("Sample Labs");
  });
});

describe("DataTable cells are one line under the new look (WS160 follow-up)", () => {
  const long = "Northwind Trading Cooperative of West Africa";
  const longRows: Row[] = [{ id: "c1", name: long, status: "Ghana, SA, Nigeria, Egypt", members: 2 }];
  const withTitle: DataTableColumn<Row>[] = [
    ...columns.slice(0, 2),
    { key: "members", header: "Members", title: (r) => `${r.members} people`, sortValue: (r) => r.members, cell: (r) => <b>{r.members}</b> },
  ];

  it("new look: the title text is a shrinking span inside a flex link, and plain cells carry their text as the title", () => {
    look.v2 = true;
    const html = renderToStaticMarkup(<DataTable<Row> {...base} rows={longRows} chips={undefined} />);
    expect(html).toContain('<span class="min-w-0 truncate">' + long + "</span>");
    expect(html).toContain('class="flex min-w-0 items-center');
    expect(html).toContain('title="' + long + '"');
    expect(html).toContain('title="Ghana, SA, Nigeria, Egypt"');
  });
  it("a column's own title wins for a cell that renders markup", () => {
    look.v2 = true;
    const html = renderToStaticMarkup(<DataTable<Row> {...base} rows={longRows} chips={undefined} columns={withTitle} />);
    expect(html).toContain('title="2 people"');
  });
  it("old look: no title, no wrapper span, the link stays inline-flex", () => {
    look.v2 = false;
    const html = renderToStaticMarkup(<DataTable<Row> {...base} rows={longRows} chips={undefined} columns={withTitle} />);
    expect(html).not.toContain("title=");
    expect(html).not.toContain("truncate");
    expect(html).toContain('class="inline-flex items-center');
    look.v2 = true;
  });
});

describe("SplitView and DetailPane", () => {
  const pane = (
    <DetailPane
      crumb="Companies · 2 of 3"
      title="Example Co"
      chips={<PaneChip>Seed</PaneChip>}
      card={<PaneCard heading="Up to date" actions={<button>Open company</button>}>Nothing to do.</PaneCard>}
      onPrev={() => {}}
      onClose={() => {}}
      expandHref="/admin/companies/c2"
    >
      <PaneSection title="Details">x</PaneSection>
    </DetailPane>
  );

  it("under the new look with an open record: list beside a labelled complementary pane", () => {
    look.v2 = true;
    const html = renderToStaticMarkup(<SplitView list={<p>LIST</p>} pane={pane} open="c2" onClose={() => {}} paneLabel="Example Co" />);
    expect(html).toContain("LIST");
    expect(html).toContain("<aside");
    expect(html).toContain('aria-label="Example Co"');
    expect(html).toContain("data-split-pane");
    expect(html).toContain("md:w-[min(58%,620px)]");
    expect(html).toContain("animate-pane-in");
  });
  it("pane order: crumb, title, chips, the action card, then the sections", () => {
    look.v2 = true;
    const html = renderToStaticMarkup(<SplitView list={null} pane={pane} open="c2" onClose={() => {}} />);
    const at = (s: string) => html.indexOf(s);
    expect(at("Companies · 2 of 3")).toBeGreaterThan(-1);
    expect(at("Companies · 2 of 3")).toBeLessThan(at("Example Co"));
    expect(at("Example Co")).toBeLessThan(at("Seed"));
    expect(at("Seed")).toBeLessThan(at("Up to date"));
    expect(at("Up to date")).toBeLessThan(at("Details"));
  });
  it("crumb buttons are named for screen readers; a disabled step is disabled", () => {
    look.v2 = true;
    const html = renderToStaticMarkup(<SplitView list={null} pane={pane} open="c2" onClose={() => {}} />);
    for (const name of ["Previous", "Next", "Open full page", "Close", "Back to the list"]) {
      expect(html).toContain(`aria-label="${name}"`);
    }
    expect(html).toContain('href="/admin/companies/c2"');
    expect(html).toMatch(/disabled=""[^>]*aria-label="Next"/);
  });
  it("shows no pane when nothing is open or there is no record", () => {
    look.v2 = true;
    expect(renderToStaticMarkup(<SplitView list={<p>LIST</p>} pane={pane} open={null} onClose={() => {}} />)).not.toContain("<aside");
    expect(renderToStaticMarkup(<SplitView list={<p>LIST</p>} pane={null} open="c9" onClose={() => {}} />)).not.toContain("<aside");
  });
  it("under the old look it is only the list, even with a record open", () => {
    look.v2 = false;
    const html = renderToStaticMarkup(<SplitView list={<p>LIST</p>} pane={pane} open="c2" onClose={() => {}} />);
    expect(html).toBe("<p>LIST</p>");
  });
  it("the dog-ear is only on a card that asks for it", () => {
    look.v2 = true;
    const hot = renderToStaticMarkup(<PaneCard heading="Blocked" hot>x</PaneCard>);
    const calm = renderToStaticMarkup(<PaneCard heading="Up to date">x</PaneCard>);
    expect(hot).toContain("var(--color-stuck)");
    expect(calm).not.toContain("var(--color-stuck)");
  });
});

describe("companyNextAction", () => {
  it("behind with a founder: a reminder, with the days", () => {
    const a = companyNextAction({ cadence: "behind", daysSince: 40, hasFounder: true });
    expect(a).toEqual({
      heading: "No update for 40 days",
      text: "The last update was 40 days ago. A reminder goes to the company's founders by email.",
      primary: "remind",
    });
  });
  it("behind, never updated", () => {
    const a = companyNextAction({ cadence: "behind", daysSince: null });
    expect(a.heading).toBe("No update yet");
    expect(a.primary).toBe("remind");
  });
  it("aging counts as behind for the reminder", () => {
    expect(companyNextAction({ cadence: "aging", daysSince: 30 }).primary).toBe("remind");
  });
  it("behind with no founder: no reminder, open the company", () => {
    const a = companyNextAction({ cadence: "behind", daysSince: 40, hasFounder: false });
    expect(a.primary).toBe("open");
    expect(a.heading).toBe("No founder in Molly");
  });
  it("current: nothing to do; today and singular day read right", () => {
    expect(companyNextAction({ cadence: "current", daysSince: 12 }).text).toBe("The last update was 12 days ago. Nothing to do.");
    expect(companyNextAction({ cadence: "current", daysSince: 0 }).text).toBe("The last update was today. Nothing to do.");
    expect(companyNextAction({ cadence: "current", daysSince: 1 }).text).toBe("The last update was 1 day ago. Nothing to do.");
    expect(companyNextAction({ cadence: "current", daysSince: 12 }).primary).toBe("open");
  });
  it("new: no update is due yet", () => {
    const a = companyNextAction({ cadence: "new", daysSince: null });
    expect(a.heading).toBe("No updates yet");
    expect(a.primary).toBe("open");
  });
});

describe("list and pane css", () => {
  const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf-8");
  const start = css.indexOf("/* Lists and the side pane (PLAN-1, WS160)");
  const end = css.indexOf("/* ── End new look ── */");
  const section = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");

  it("sits inside the new-look section", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });
  it("reads the density tokens instead of repeating them", () => {
    expect(section).toContain("var(--list-row-h)");
    expect(section).toContain("var(--group-h)");
    expect(section).toContain("var(--bar-h)");
    expect(section).toContain("var(--filter-h)");
    expect(section).toContain("var(--column)");
    expect(section).toContain("var(--gutter)");
    expect(section).not.toMatch(/(^|[^-\w])(44px|1104px)/);
  });
  it("has no left-edge bars and cancels the old look's focus bar", () => {
    expect(section).not.toMatch(/border-left|inset-y|inset-inline-start/);
    expect(section).toMatch(/tr\[data-row\]:focus-visible \{[^}]*box-shadow: none/);
  });
  it("the cursor is the Sky underscore at the gutter, 18 by 3", () => {
    expect(section).toMatch(/::after \{[^}]*left: var\(--row-pad, 12px\);[^}]*width: 18px;[^}]*height: 3px;[^}]*var\(--color-accent\)/);
  });
  it("columns drop at 600 and 480", () => {
    expect(section).toContain("@container (max-width: 600px)");
    expect(section).toContain("@container (max-width: 480px)");
  });
  it("nothing is centred: blocks above a list sit one gutter in, and a list is its own content box", () => {
    expect(section).toMatch(/\.shell-page\[data-width="full"\] \{\s*--row-pad: var\(--gutter\);/);
    expect(section).not.toContain("100cqw");
    expect(section).not.toMatch(/:has\(\[data-split-pane\]\)[^{]*\{\s*--row-pad/);
    // inside the list there is no side padding, so rows, hairlines and tints end with the content
    expect(section).toMatch(/\[data-datatable\]\[data-density\] \{\s*--row-pad: 0px;/);
    expect(section).toMatch(/\[data-datatable\]\[data-list-mode\] \{\s*margin-inline: var\(--gutter\);\s*max-width: var\(--column\);/);
  });
  it("the row-actions cell has its own space, so it cannot overlap the last column", () => {
    expect(section).toMatch(/td\[data-actions\] \{\s*width: 1%;\s*max-width: none;\s*overflow: visible;\s*white-space: nowrap;/);
  });
  it("column headings get 8px of air under the filter bar", () => {
    expect(section).toMatch(/thead th \{\s*height: 40px;\s*padding: 8px 0 0 24px;/);
  });
  it("cells are one line with an ellipsis; numbers are not cut", () => {
    expect(section).toMatch(/\[data-density\] td \{[^}]*max-width: var\(--cell-max, 240px\);[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/);
    expect(section).toMatch(/td\.num \{\s*max-width: none;\s*overflow: visible/);
  });
  it("a sticky first column sits on the page background, not a card band", () => {
    expect(section).toMatch(/td\.sticky \{\s*background-color: var\(--color-bg\)/);
  });
  it("only success, warning and danger badges have a glyph", () => {
    const badges = css.slice(css.indexOf("/* Badges:"), css.indexOf("/* StatusDot:"));
    expect(badges).toMatch(/\.badge-info::before,\s*html\[data-look="v2"\] \[data-surface="admin"\] \.badge-neutral::before \{\s*display: none;/);
    expect(badges).not.toContain("1.25px");
  });
  it("the sticky group heading sits under the header bar and filter bar", () => {
    expect(section).toContain("top: calc(var(--bar-h) + var(--filter-h) - 24px)");
    expect(section).toContain("scroll-padding-top: calc(var(--bar-h) + var(--filter-h) + var(--group-h))");
  });
});
