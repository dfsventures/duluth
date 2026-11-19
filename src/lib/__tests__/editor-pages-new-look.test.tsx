import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// WS172 (B-171): editors and create forms in the new look. Every new-look class is a `v2:` variant,
// so the old-look classes must all still be there. Placeholder data only.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/broadcasts/b1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { ComposerTopBar } from "@/components/composer/composer-top-bar";
import { ComposerTitleField } from "@/components/composer/composer-title-field";
import { EDITOR_COLUMN, EDITOR_SECTION_BODY, EDITOR_SECTION_CARD } from "@/lib/editor-styles";

describe("composer bar", () => {
  const html = renderToStaticMarkup(
    <ComposerTopBar
      draftLabel="Draft"
      saveStateLabel="Saved"
      secondaryActions={<button>Save</button>}
      publishLabel="Send"
      onPublishClick={() => {}}
      overflowItems={[{ label: "Delete draft", onClick: () => {} }]}
    />
  );

  it("keeps the old-look rule, mono label and every action", () => {
    expect(html).toContain("border-b pb-4");
    expect(html).toContain("font-mono text-xs uppercase");
    expect(html).toContain("Draft");
    expect(html).toContain("Save");
    expect(html).toContain(">Send<");
    expect(html).toContain('aria-label="More actions"');
  });

  it("drops the rule and the mono caps only under v2", () => {
    // Audit #8 / #20: the bar is now the page header's sticky bar (hairline from .shell-header).
    expect(html).toContain("shell-header");
    expect(html).toContain("v2:normal-case");
    expect(html).toContain("v2:font-sans");
  });
});

describe("composer title field", () => {
  it("keeps the display title and mono period, and sets sans under v2", () => {
    const html = renderToStaticMarkup(<ComposerTitleField title="Placeholder" onTitleChange={() => {}} period="2026-Q3" onPeriodChange={() => {}} />);
    expect(html).toContain("font-display text-3xl");
    expect(html).toContain("font-mono text-sm");
    expect(html).toContain("v2:font-sans");
    expect(html).toContain("v2:text-title");
  });
});

describe("editor class strings", () => {
  it("are all v2 variants, so the old look cannot match them", () => {
    for (const s of [EDITOR_COLUMN, EDITOR_SECTION_BODY, EDITOR_SECTION_CARD]) {
      for (const c of s.split(" ")) expect(c.startsWith("v2:")).toBe(true);
    }
  });

  it("put the editing column at 720 and unbox a card", () => {
    expect(EDITOR_COLUMN).toContain("v2:max-w-[720px]");
    expect(EDITOR_SECTION_CARD).toContain("v2:border-0");
    expect(EDITOR_SECTION_CARD).toContain("v2:p-0");
  });
});
