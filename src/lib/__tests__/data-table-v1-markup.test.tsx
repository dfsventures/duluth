import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// PLAN-1, WS160. Under the old look <DataTable> must render exactly the markup it did before the
// new look existed: same elements, same classes, no extra attributes, whatever new props a page
// passes. The snapshot was recorded from the code before WS160 touched the table; if it changes,
// the old look changed. Server render = old look (useLook's server snapshot is v1).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/companies",
  useSearchParams: () => new URLSearchParams("group=status&open=c2"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

interface Row {
  id: string;
  name: string;
  status: string;
  age: number;
}
const rows: Row[] = [
  { id: "c1", name: "Acme", status: "Behind", age: 40 },
  { id: "c2", name: "Example Co", status: "Current", age: 3 },
  { id: "c3", name: "Sample Labs", status: "Behind", age: 61 },
];
const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Company", sortValue: (r) => r.name, cell: (r) => r.name },
  { key: "status", header: "Status", mobile: "badge", sortValue: (r) => r.status, cell: (r) => r.status },
  { key: "age", header: "Age", align: "num", mobile: "meta", sortValue: (r) => r.age, cell: (r) => `${r.age}d` },
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
};

describe("DataTable markup under the old look", () => {
  it("full table: search, chips, links, actions, export, columns menu, grouping", () => {
    const html = renderToStaticMarkup(
      <DataTable<Row>
        {...base}
        rowHref={(r) => `/admin/companies/${r.id}`}
        rowActions={(r) => <button>Remind {r.name}</button>}
        searchText={(r) => [r.name]}
        chips={[{ key: "behind", label: "Behind", test: (r) => r.status === "Behind" }]}
        tableId="t"
        exportCsv={{ filename: "Companies" }}
        groupBy={{ options: [{ key: "status", label: "Status", getGroup: (r) => ({ id: r.status, label: r.status }) }] }}
        minWidth={820}
      />
    );
    expect(html).toMatchSnapshot();
  });

  it("new props change nothing: density, onOpenRow, openKey and column priorities are ignored", () => {
    const plain = renderToStaticMarkup(<DataTable<Row> {...base} rowHref={(r) => `/admin/companies/${r.id}`} />);
    const withNew = renderToStaticMarkup(
      <DataTable<Row>
        {...base}
        rowHref={(r) => `/admin/companies/${r.id}`}
        density="compact"
        onOpenRow={() => {}}
        openKey="c2"
        columns={columns.map((c, i) => (i === 2 ? { ...c, dropBelow: 600 as const } : c))}
      />
    );
    expect(withNew).toBe(plain);
    expect(plain).not.toContain("data-density");
    expect(plain).not.toContain("data-open");
    expect(plain).not.toContain("data-drop");
  });

  it("flat table snapshot", () => {
    expect(
      renderToStaticMarkup(<DataTable<Row> {...base} rowHref={(r) => `/admin/companies/${r.id}`} />)
    ).toMatchSnapshot();
  });
});
