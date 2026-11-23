// New look on the LP portal, the sign-in pages and the home page (PLAN-1, WS166). Like the founder
// class sets (founder-look.ts), every class is a `v2:` utility: under the old look nothing here applies
// and the pages render exactly as before. These are calm pages for occasional, often phone, visits:
// one size up from the admin where it helps reading, and 44px tap targets on phones.

/** The headline of a sign-in page ("Sign in to Molly.", the LP entry): 28/36 semibold sans. */
export const V2_AUTH_TITLE = "v2:font-sans v2:text-[28px] v2:leading-9 v2:font-semibold v2:tracking-[-0.01em]";

/** A page title inside the LP portal ("Your fund reports."): 24/32 semibold, as the admin's pages. */
export const V2_PAGE_TITLE = "v2:font-sans v2:text-[24px] v2:leading-8 v2:font-semibold v2:tracking-normal";

/** A small section label over a form or a group ("DFS team", "or with email"): 14/20 medium, sentence case. */
export const V2_SECTION_LABEL = "v2:font-sans v2:text-row v2:font-medium v2:normal-case v2:tracking-normal v2:text-foreground";

/** A form field's label written by hand (the LP sign-in form): 14/20 medium, as the shared fields. */
export const V2_FIELD_LABEL = V2_SECTION_LABEL;

/**
 * A hand-written text field (the LP sign-in form): the shared field's look as on /login (control
 * border, radius, the card fill it already has), 36 high on desktop and 44 on phones with 16px text
 * there, so iPhones do not zoom.
 */
export const V2_TEXT_FIELD =
  "v2:h-9 v2:rounded-ctl v2:border-[color:var(--color-ctl)] v2:px-3 v2:py-0 v2:text-row max-md:v2:h-11 max-md:v2:text-[16px]";

/** A small text link or button on a phone: a 44px hit area. */
export const V2_TAP = "max-md:v2:inline-flex max-md:v2:min-h-11 max-md:v2:items-center";
