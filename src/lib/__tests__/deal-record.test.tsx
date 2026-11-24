import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// B-133 (Deal Ledger company page in the new look). Placeholder data only.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/portfolio/p1",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DealRecord } from "@/components/admin/portfolio/deal-record";

const noop = () => {};

const render = (over: Partial<Parameters<typeof DealRecord>[0]> = {}) =>
  renderToStaticMarkup(
    <DealRecord
      name="Example Co"
      country="Kenya"
      latestValuation={12000000}
      linked={{ id: "c1", name: "Example Co (Molly)" }}
      onNewRound={noop}
      onLink={noop}
      onUnlink={noop}
      notices={null}
      {...over}
    >
      <div>SECTIONS</div>
    </DealRecord>
  );

describe("Deal Ledger company page, new look", () => {
  it("has the back link, the one primary, the ⋯ menu and the grid hooks", () => {
    const html = render();
    expect(html).toContain('href="/admin/portfolio"');
    expect(html).toContain("New round");
    expect(html).toContain('aria-label="More actions"');
    expect(html).toContain("dl-dossier-grid");
    expect(html).toContain("SECTIONS");
    // The panel comes first in the markup, so it moves up under the title on a phone.
    expect(html.indexOf('aria-label="Company details"')).toBeLessThan(html.indexOf("SECTIONS"));
  });

  it("shows every fact in the panel", () => {
    const html = render();
    for (const text of ["Kenya", "$12,000,000", "Latest valuation", "Molly account", "/admin/companies/c1", "Example Co (Molly)"]) {
      expect(html, text).toContain(text);
    }
  });

  it("says Not linked and leaves out missing facts", () => {
    const html = render({ country: null, latestValuation: null, linked: null });
    expect(html).toContain("Not linked");
    for (const gone of ["Country", "Latest valuation"]) expect(html.includes(gone), gone).toBe(false);
  });

  it("shows the unlink confirmation under the title when given", () => {
    expect(render({ notices: <p>Unlink Example Co?</p> })).toContain("Unlink Example Co?");
  });
});
