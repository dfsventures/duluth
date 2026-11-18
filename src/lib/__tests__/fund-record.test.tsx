import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// B-133 (fund page in the new look). Placeholder data only.
vi.mock("@/lib/use-new-look", () => ({ useNewLook: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/funds/f1",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { FundRecord } from "@/components/admin/funds/fund-record";
import { FundPerformanceCard } from "@/components/fund-performance-card";

const noop = () => {};
const tabs = [
  { key: "deals" as const, label: "Deals", count: 3 },
  { key: "lps" as const, label: "LPs", count: 1 },
  { key: "reports" as const, label: "Reports", count: 0 },
  { key: "cashflows" as const, label: "Cashflows", count: 2 },
];
const fund = { name: "Example Fund I", slug: "example-1", groupLabel: "Main funds", aumUsd: 5000000, firstDealDate: "2024-03-01T00:00:00.000Z" };

const render = (over: Partial<Parameters<typeof FundRecord>[0]> = {}) =>
  renderToStaticMarkup(
    <FundRecord
      fund={fund}
      editingDetails={false}
      detailsForm={<form>DETAILS FORM</form>}
      onEditDetails={noop}
      onAddDeal={noop}
      editingPerformance={false}
      onEditPerformance={noop}
      performance={<div>PERFORMANCE CARD</div>}
      performanceForm={<form>PERFORMANCE FORM</form>}
      tabs={tabs}
      activeTab="deals"
      {...over}
    >
      <div>TAB BODY</div>
    </FundRecord>
  );

describe("fund page, new look", () => {
  it("has the back link, the one primary, the ⋯ menu and the grid hooks", () => {
    const html = render();
    expect(html).toContain('href="/admin/funds"');
    expect(html).toContain("Add deal");
    expect(html).toContain('aria-label="More actions"');
    expect(html).toContain("fund-dossier-grid");
    expect(html).toContain("PERFORMANCE CARD");
    expect(html).toContain("TAB BODY");
    // The panel comes first in the markup, so it moves up under the title on a phone.
    expect(html.indexOf('aria-label="Fund details"')).toBeLessThan(html.indexOf('aria-label="Fund sections"'));
  });

  it("shows every fact in the panel and leaves out missing ones", () => {
    const html = render();
    for (const text of ["Example Fund I", "example-1", "Main funds", "$5,000,000", "First deal"]) expect(html, text).toContain(text);
    const bare = render({ fund: { ...fund, groupLabel: null, aumUsd: null, firstDealDate: null } });
    for (const gone of ["Group", "AUM", "First deal"]) expect(bare.includes(gone), gone).toBe(false);
  });

  it("swaps the panel for the details form while editing", () => {
    const html = render({ editingDetails: true });
    expect(html).toContain("DETAILS FORM");
    expect(html.includes("example-1")).toBe(false);
  });

  it("shows the performance form only while editing it", () => {
    expect(render().includes("PERFORMANCE FORM")).toBe(false);
    expect(render({ editingPerformance: true })).toContain("PERFORMANCE FORM");
  });

  it("keeps the Part 36 metric labels and order in the performance card", () => {
    const html = renderToStaticMarkup(
      <FundPerformanceCard
        performance={{ invested: 1000000, impliedValue: 1500000, dilutionAware: true, paidIn: 1000000, approximate: false, tvpi: 1.5, dpi: 0.2, grossIrr: 0.12, asOf: "2026-11-01T00:00:00.000Z" }}
      />
    );
    const labels = ["Invested", "Implied Value", "TVPI", "DPI", "Gross IRR"];
    const at = labels.map((l) => html.indexOf(l));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});
