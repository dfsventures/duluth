// New look on the founder pages (PLAN-1, WS165). The founder pages are hand-built (cards, mono caps
// labels, boxed lists) rather than made of the admin's shared list and detail components, so these
// are the few class sets they share. Every class is a `v2:` utility: under the old look nothing here
// applies and the pages render exactly as before. Sizes follow docs/design/page-types-v1.md.

/** A small mono-caps label ("NEXT STEP", "COMPANY") becomes a 12/18 sentence-case grey label. */
export const V2_EYEBROW = "v2:font-sans v2:text-meta v2:font-normal v2:normal-case v2:tracking-normal v2:text-muted-foreground";

/** A section heading drawn as a mono-caps label ("FROM DFS") becomes a 16/24 heading (§4.2). */
export const V2_SECTION_HEAD =
  "v2:font-sans v2:text-heading v2:leading-6 v2:font-semibold v2:normal-case v2:tracking-normal v2:text-foreground";

/** A display-font heading (h2/h3 in font-display) in the sans. */
export const V2_HEADING = "v2:font-sans v2:text-heading v2:leading-6 v2:font-semibold";

/** A figure in a stat strip: 20/28 semibold tabular (as the Stat component). */
export const V2_STAT_VALUE = "v2:font-sans v2:text-[20px] v2:leading-7 v2:font-semibold v2:tracking-normal v2:tabular-nums";

/** A stat's caption line. */
export const V2_STAT_CAPTION = "v2:text-meta";

/**
 * A boxed list (rounded card, edge, shadow) becomes hairline rows on the page: no box, a hairline
 * above and below, the rows' own dividers between. The rows reach 12px past each content edge for
 * their hover fill (V2_ROW), so the list must not clip them.
 */
export const V2_LIST = "v2:overflow-visible v2:rounded-none v2:border-x-0 v2:border-y v2:border-row-divider v2:bg-transparent v2:shadow-none";

/**
 * A row in a V2_LIST: 44 high on desktop (one line), at least 64 with 12px padding on phones (two
 * lines), text on the content edge, the hover fill 12px past it.
 */
export const V2_ROW = "v2:-mx-3 v2:min-h-11 v2:px-3 v2:py-0 v2:hover:bg-row-hover max-md:v2:min-h-16 max-md:v2:py-3";

/** The same row standing alone (it is its own V2_LIST): flush with the content edges. */
export const V2_ROW_FLUSH = "v2:min-h-11 v2:px-0 v2:py-0 v2:hover:bg-row-hover max-md:v2:min-h-16 max-md:v2:py-3";

/**
 * A card that frames a whole section or form becomes the raised tier (--color-surface) with no edge
 * and no shadow, radius 8 (the Detail panel's treatment, §4.2). 16px padding on phones.
 */
export const V2_PANEL = "v2:border-0 v2:shadow-none v2:rounded-lg v2:p-6 max-md:v2:p-4";

/**
 * A wrapper around a stack of `<Card>`s (a long form, a settings page): each card becomes a section on
 * the page, no box, a hairline between sections, its CardTitle a 16/24 heading. Only direct `.card`
 * children are touched, so cards nested inside a section keep their own look.
 */
export const V2_SECTIONS =
  "v2:space-y-0 v2:[&>.card]:rounded-none v2:[&>.card]:border-0 v2:[&>.card]:bg-transparent v2:[&>.card]:px-0 v2:[&>.card]:py-8 v2:[&>.card]:shadow-none v2:[&>.card:first-child]:pt-0 v2:[&>.card+.card]:border-t v2:[&>.card_h3]:font-sans v2:[&>.card_h3]:text-heading v2:[&>.card_h3]:leading-6";

/** A card that is only a frame (a form, a table) loses its box altogether. */
export const V2_UNBOX = "v2:rounded-none v2:border-0 v2:bg-transparent v2:p-0 v2:shadow-none";

/**
 * A card holding a form above the page's list (New link, Invite, Define a metric). Fields are filled
 * with the raised tier, so the form sits on the page (not on a V2_PANEL, where they would vanish),
 * closed off from the list by a hairline.
 */
export const V2_FORM_BLOCK = `${V2_UNBOX} v2:border-b v2:border-border v2:pb-8`;
