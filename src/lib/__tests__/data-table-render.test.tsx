import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Server-render smoke test of <DataTable> grouping, subtotals and column
// visibility defaults. next/navigation is mocked; no DOM needed.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/x",
  useSearchParams: () => new URLSearchParams("group=fund"),
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
  fund: string;
  amount: number;
}
const rows: Row[] = [
  { id: "1", name: "Alpha", fund: "Fund B", amount: 10 },
  { id: "2", name: "Beta", fund: "Fund A", amount: 20 },
  { id: "3", name: "Gamma", fund: "Fund A", amount: 5 },
];
const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", sortValue: (r) => r.name, cell: (r) => r.name },
  { key: "fund", header: "Fund", sortValue: (r) => r.fund, cell: (r) => r.fund },
  { key: "amount", header: "Amount", align: "num", sortValue: (r) => r.amount, cell: (r) => `$${r.amount}` },
];

function render(extra: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return renderToStaticMarkup(
    <DataTable<Row>
      label="Deals"
      noun="deal"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      defaultSort={{ key: "name", dir: "asc" }}
      empty={null}
      {...extra}
    />
  );
}

describe("DataTable", () => {
  it("renders a flat table without a group heading or subtotal by default", () => {
    const html = render();
    expect(html).not.toContain("data-group");
    expect(html).not.toContain("data-subtotal");
    expect(html).toContain("Alpha");
  });

  it("groups by the ?group= option with a heading and a subtotal per group, groups A to Z", () => {
    const html = render({
      groupBy: {
        options: [{ key: "fund", label: "Fund", getGroup: (r) => ({ id: r.fund, label: r.fund }) }],
        subtotal: (rs) => ({ amount: `$${rs.reduce((n, r) => n + r.amount, 0)}` }),
      },
    });
    expect((html.match(/data-group/g) ?? []).length).toBe(2);
    expect((html.match(/data-subtotal/g) ?? []).length).toBe(2);
    expect(html.indexOf("Fund A")).toBeLessThan(html.indexOf("Fund B"));
    expect(html).toContain("$25"); // Fund A subtotal
    expect(html).toContain("$10"); // Fund B subtotal and its single row
    expect(html).toContain("Subtotal");
  });

  it("offers Columns and Export CSV only when asked", () => {
    expect(render()).not.toContain("Export CSV");
    const html = render({ tableId: "t", exportCsv: { filename: "Deals" } });
    expect(html).toContain("Export CSV");
    expect(html).toContain("Columns");
  });
});
