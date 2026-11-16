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
    expect(html).toContain("shell-header");
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
    expect(shell).toContain('v2:max-w-none');
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
  it("sidebar is 224px, items 28px (44px on phones) with no left rule under the new look", () => {
    expect(sidebar).toContain("v2:w-56");
    expect(sidebar).toContain("v2:h-7");
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
  it("shows unset chips dashed with a plus and no Clear all", () => {
    const html = renderToStaticMarkup(
      <FilterBar chips={[{ key: "owner", label: "Owner" }]} onOpen={noop} onRemove={noop} onClearAll={noop} />
    );
    expect(html).toContain("border-dashed");
    expect(html).not.toContain("Clear all");
  });
  it("shows a set chip with its value, a remove button and Clear all", () => {
    const html = renderToStaticMarkup(
      <FilterBar chips={[{ key: "owner", label: "Owner", value: "Sam Admin" }]} onOpen={noop} onRemove={noop} onClearAll={noop} />
    );
    expect(html).toContain("Sam Admin");
    expect(html).toContain('aria-label="Remove Owner filter"');
    expect(html).toContain("Clear all");
  });
});
