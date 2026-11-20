/**
 * Shared class strings for the editor and create-form pages in the new look (PLAN-1, WS172).
 * Every class is a `v2:` variant, so under the old look none of them matches and the markup
 * renders as before. Kept as whole literals so Tailwind's scanner finds them.
 */

/** A Card that becomes a plain section in the page's 720 column: no box, no padding. */
export const EDITOR_SECTION_CARD = "v2:border-0 v2:bg-transparent v2:shadow-none v2:p-0";

/** The CardContent inside such a card: its own top padding goes too. */
export const EDITOR_SECTION_BODY = "v2:pt-0";

/** The editing and reading column: 720 wide, left-aligned like the record pages. */
export const EDITOR_COLUMN = "v2:mx-0 v2:max-w-[720px]";

/**
 * Segmented choice (audit #11), new look only: the chosen segment gets the surface fill, a control border
 * and weight 500, so the state is never carried by colour alone; the others are transparent.
 */
export const segmentClass = (on: boolean) =>
  on
    ? "border-[color:var(--color-ctl)] bg-[var(--color-surface)] font-medium text-foreground"
    : "bg-transparent font-normal text-secondary";

/** A title input or page title in sans at the record-title size. */
export const EDITOR_TITLE = "v2:font-sans v2:text-doc-title";
