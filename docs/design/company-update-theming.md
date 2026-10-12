# Company update theming (logo + one accent colour)

Status: direction for approval. Author: Nisat. Date: 2026-10-12.
Mockup: https://claude.ai/artifact/Txnt17x4oarLAJ4rD6gxi5 (every colour in it is computed by the algorithm in section 3).
Not production code. Alvin builds from this once the open decisions (section 9) are answered.

## 0. Findings from the repo that shape this spec

1. **Share links span many companies.** `ShareableLink` has many `ShareableLinkCompany` rows and `/share/[token]` renders a combined feed. A page-wide brand only makes sense when the link covers exactly one company (see D1).
2. **Molly does not email investors today.** `sendUpdatePublishedEmail` (src/lib/email.ts, called from src/lib/publish-update.ts) goes to `TEAM_EMAIL` only. Investors get a share link. The "update email" in scope is therefore a new investor-facing template (D2). The existing `emailWrapper` (DFS paper ground, DFS logo header) is the sibling to extend, not to change.
3. **The logo upload on /company/profile is a stub.** The file input has no handler; `Company.logo` ("S3 key or URL") is only written by the PATCH whitelist in `src/app/api/companies/[id]/route.ts`. Logo upload and processing (section 4) is real work and a prerequisite.
4. The share page is a client component that fetches `/api/share/[token]`. Theme tokens should come down in that response so there is no unthemed flash.
5. Page ground is Paper `#EBE8DE`, cards `#FFFFFF`, text `#14140F`. DFS default accent is `#44688E`. These are the surfaces any company colour has to be safe on.

## 1. Principle

The founder's colour is a *signal of whose update this is*, not a design system. It touches a small, fixed set of elements, always through a derived safe shade, never raw on text. Everything structural (type, radii, spacing, status colours, footer) stays DFS. If the algorithm has to choose between the founder's exact colour and legibility, legibility wins and the settings screen says so.

Not themed: LP portal, fund reports, admin, the founder's own Molly app. No custom fonts, no second colour, no gradients, no background images.

## 2. What takes the accent

Six derived tokens come from one input hex (section 3): `band`, `fill`, `on`, `ink`, `tint`, `mark` (+ `hover`, `edge`).

| Element (share page) | Token | Notes |
|---|---|---|
| Top band, 6px full width | `band` | Exact picked colour; falls back to `mark` if the pick is too pale to be visible (<1.3:1 against white and Paper). Decorative, no WCAG requirement. |
| Logo plate (header) | white plate, or `fill` plate | See section 4. |
| Section labels ("UPDATES (2)") | `ink` | Mono caps label, 10.5px. |
| Metric strip background | `tint` | Figures stay `#14140F`; units and labels stay neutral secondary text. The accent frames the numbers, it does not recolour them. |
| Links inside update body | `ink` | Always underlined (colour is never the only cue). |
| Company chip in the feed | `tint` fill + `ink` text | Replaces the neutral company badge. |
| Primary button (email gate "View update") | `fill`, text `on`, hover `hover`, 1px `edge` border only when `needsEdge` | Same 10px radius and mono-caps `cta` role as Direction B. |
| Focus ring | `ink` | 2px, 2px offset. |
| Expand chevron | `ink` | |

Stays neutral, always: page ground, card surfaces and borders, headings and body copy, metric figures, status tones (sage/clay/sand/amber), sector and stage badges, the email-gate dialog frame, error and warning colours, the "Shared via Molly" footer, the DFS logo mark.

**Chart series:** there are no charts on the share page today. If one is added: the company's own series uses `mark` (3:1 against white, the WCAG bar for graphical objects); comparison series stay neutral stone. Never encode meaning in the accent alone.

**Multi-company links:** the same tokens apply but are scoped to each company's card only (`--co-*` variables set on the card root). Page band, header, button and focus ring stay DFS blue. See D1.

Implementation shape (web): set the eight tokens as CSS custom properties on a wrapper element (`--co-band`, `--co-ink`, `--co-tint`, `--co-fill`, `--co-on`, `--co-hover`, `--co-edge`, `--co-mark`) and write component rules as `color: var(--co-ink, var(--color-accent))`, so an unthemed company, or a failed derivation, falls back to DFS with no branch in the markup. Do not touch the global `--color-accent`, so nothing outside the themed wrapper can change. Remember the `cn()` / tailwind-merge pitfall from `f4db3a4` if named type roles are combined with colour classes.

## 3. Contrast safety: the derivation

One pure function, `deriveTheme(hex) -> Theme`, in `src/lib/brand-theme.ts`. It is the only place colour logic lives; the share API, the email builder and the settings preview all call it. Store only the founder's picked hex (`Company.brandColor`), never the derived values, so improving the algorithm later upgrades every company with no migration.

Constants: `WHITE #FFFFFF`, `PAPER #EBE8DE`, `DARK #14140F`. Margin: use thresholds 4.55 and 3.05 internally so rounding in an audit tool never lands on 4.49.

Helpers (standard formulas):
- `lum(hex)`: WCAG relative luminance (sRGB linearised, 0.2126 / 0.7152 / 0.0722).
- `cr(a, b)`: `(max(lumA, lumB) + 0.05) / (min + 0.05)`.
- `mix(a, b, t)`: per-channel linear mix, `t` = share of `b`.
- `darkenUntil(hex, ok, maxSteps)`: convert to HSL, subtract 1 from lightness per step (hue and saturation fixed) until `ok(candidate)` is true or the step cap/zero lightness is reached. Returns the candidate and step count.

Steps, in order:

1. **Normalise.** Accept `#RGB` or `#RRGGBB`, any case, optional `#`. Store as lowercase `#rrggbb`. Reject anything else with a field error. Never block on contrast, only correct it.
2. **tint** = `mix(brand, WHITE, lum(brand) > 0.6 ? 0.45 : 0.88)`. (Pale colours need a stronger tint or they vanish on white.)
3. **fill and on** (buttons, monogram tile, brand logo plate):
   1. If `cr(WHITE, brand) >= 4.55`: `fill = brand`, `on = WHITE`.
   2. Else darken `brand` up to 12 lightness points until `cr(WHITE, fill) >= 4.55`. If reached: `on = WHITE`. (Keeps white-on-colour, the usual brand look, for modest corrections: teal `#12A5B0` becomes `#0E828B`.)
   3. Else if `cr(DARK, brand) >= 4.55`: `fill = brand`, `on = DARK`. (Pale yellow, orange, lime keep their true colour with dark text.)
   4. Else (dead-zone mid-tones where neither passes): darken without a cap until white passes.
   5. `hover` = `fill` 6 lightness points darker, only if `on` still has >= 4.55 against it, otherwise `hover = fill`.
4. **ink** (any text-coloured use: links, labels, chips, focus ring): `darkenUntil(brand, c => min(cr(c,WHITE), cr(c,PAPER), cr(c,tint)) >= 4.55)`. Checking all three surfaces it can sit on is what makes it safe everywhere. Same hue and saturation, so pale yellow becomes dark gold `#786600`, not grey.
5. **mark** (graphics, outlines, non-text, 3:1): `darkenUntil(brand, c => min(cr(c,WHITE), cr(c,PAPER)) >= 3.05)`.
6. **band**: `brand` if `min(cr(brand,WHITE), cr(brand,PAPER)) >= 1.3`, else `mark`.
7. **needsEdge**: `min(cr(fill,WHITE), cr(fill,PAPER)) < 3.05`. When true, buttons and monogram tiles get a 1px `edge = mark` border so the shape is visible (WCAG 1.4.11). The label already carries the button's identity, so this is a clarity aid, not a hard requirement.

Worked results (verified by script; the mockup shows them live):

| Pick | fill / on | ink | tint | band | Notes |
|---|---|---|---|---|---|
| `#12A5B0` teal (3.0:1 on white) | `#0E828B` / white, 4.58:1 | `#0C7178` (5.76 on white, 4.69 on Paper) | `#E3F4F6` | exact | Fill darkened 8 points so white text passes. |
| `#FFEE8C` pale yellow (1.18:1) | `#FFEE8C` / dark, 15.7:1, with edge | `#786600` | `#FFF6C0` | `#968000` (shade) | Brand yellow kept on the button; everything text-like is gold; rule uses the shade because true yellow is invisible on Paper. |
| `#44688E` DFS default | as picked / white | as picked | `#E9EDF1` | exact | Identity: unthemed equals themed with the default colour. |
| `#FFFFFF` | white / dark with edge | `#666666` | white | `#828282` | Warn (section 6). |

Edge cases: near-grey picks produce a neutral look (soft hint, not an error). Near-black picks pass at step 3.1 and look like neutral text; fine. Two colours that look the same to a founder (`#12A5B0` vs `#0E828B`) are expected to differ slightly in the button; the settings panel shows the corrected swatch so nothing is a surprise.

Required tests (vitest, alongside `design-tokens.test.ts`): a table of ~40 hexes spanning the hue wheel at several lightnesses asserting `cr(on, fill) >= 4.5`, `cr(ink, WHITE) >= 4.5`, `cr(ink, PAPER) >= 4.5`, `cr(ink, tint) >= 4.5`, `cr(mark, WHITE) >= 3`, output is valid 6-digit hex, and idempotence (`deriveTheme(deriveTheme(x).ink).ink === deriveTheme(x).ink`). Add pure white, pure black, and `#808080` explicitly.

Reference implementation (HSL, no dependencies; this is the exact code the mockup runs):

```js
const WHITE='#ffffff', PAPER='#ebe8de', DARK='#14140f';
function deriveTheme(input){
  const brand=input.toLowerCase();
  const tint=mix(brand,WHITE,lum(brand)>0.6?0.45:0.88);
  let fill=brand,on;
  if(cr(WHITE,brand)>=4.55){on=WHITE}
  else{const d=darkenUntil(brand,c=>cr(WHITE,c)>=4.55,12);
    if(cr(WHITE,d.hex)>=4.55){fill=d.hex;on=WHITE}
    else if(cr(DARK,brand)>=4.55){on=DARK}
    else{fill=darkenUntil(brand,c=>cr(WHITE,c)>=4.55).hex;on=WHITE}}
  const ink=darkenUntil(brand,c=>Math.min(cr(c,WHITE),cr(c,PAPER),cr(c,tint))>=4.55).hex;
  const mark=darkenUntil(brand,c=>Math.min(cr(c,WHITE),cr(c,PAPER))>=3.05).hex;
  const band=Math.min(cr(brand,WHITE),cr(brand,PAPER))>=1.3?brand:mark;
  const needsEdge=Math.min(cr(fill,WHITE),cr(fill,PAPER))<3.05;
  /* hover: fill 6 lightness points darker if cr(on,hover)>=4.55 else fill */
  return {brand,fill,on,ink,tint,mark,band,needsEdge,edge:mark /*,hover*/};
}
```
The complete working file, helpers included, is in Appendix A.

## 4. Logo handling

**Upload rules (client + server, same limits):** PNG, JPG, WebP or SVG, max 2 MB. Minimum 256px on the long edge (raster). Aspect ratio between 1:1 and 6:1 (wide). Wider than 6:1 or taller than wide is rejected with a plain message: "This logo is very wide. Add some space above and below, or upload a version with less empty space." Square marks are allowed and render as a 40px square.

**Processing (server, on upload):** trim transparent margins, rasterise SVG, and write two derivatives next to the original: `logo-web.png` (fit in 480 x 160, for the page at 2x) and `logo-email.png` (same box, flattened onto the chosen plate colour so email clients never invert transparency). Sanitise or discard SVG sources; never serve uploaded SVG to browsers directly (script risk). Keep the original key in `Company.logo`; store derivative keys on a new column or derive them by naming convention (D6).

**Display sizes:**
- Share page header: fit inside 176 x 44 plate, logo itself up to 160 x 28 (square marks 28 x 28), `object-fit: contain`, never cropped, stretched or recoloured. Phone: plate height 40.
- Company card in a multi-company link: 36px plate height.
- Email header: logo image 32px tall (max 200px wide), `width`/`height` attributes set, because Outlook ignores CSS sizing.
- Always `alt="{Company name}"`.

**Plate (dark/light logos):** all themed surfaces are light, so a logo always sits on a plate. Two choices, a segmented control in settings:
- **White** (default): for dark or full-colour logos.
- **Your colour**: plate = `fill`, for white or reversed logos.
On upload, compute the mean luminance of opaque pixels. If the logo is mostly white (> 0.85) and plate = White, show an inline warning and pre-select "Your colour". If plate = Your colour and the logo-to-fill contrast is < 3:1, show: "This logo may be hard to see on your colour." Warn, never block.

**No logo:** monogram tile (company initial, 32px, `fill` with `on` text, 8px radius, `edge` when needed) next to the company name in Space Grotesk 600, `#14140F`. Same fallback if the logo fails to load (`onError` swaps to the wordmark) and in email when images are blocked (name as styled text in `ink`).

## 5. Email

Applies to a new investor update email (D2). Sender, reply-to, footer and legal copy stay DFS. Only the pieces in section 2 are themed. All of this is built with nested tables, because Gmail strips `<style>` blocks it dislikes, Outlook desktop uses the Word engine, and Apple Mail will accept anything.

Rules:
1. **Plain hex, inline, everywhere.** No CSS variables, no `color-mix`, no `rgba()`, no gradients, no `calc()`. Compute every colour in TypeScript via `deriveTheme` and interpolate.
2. **Layout with `<table role="presentation">`**, 600px max, `width="100%"` with `max-width` on the inner table. Set `bgcolor` attribute AND `background` style on every coloured cell (Outlook honours the attribute).
3. **Top band:** a table row, `height="6"`, `bgcolor`, `line-height:6px; font-size:6px`. Not a CSS border.
4. **Bulletproof button:** a table cell with `bgcolor="{fill}"` and the label in an `<a>` with padding, `display:inline-block`, text colour `{on}`, `border-radius: 8px` on the cell. For Outlook desktop, which ignores border-radius and padding on links, wrap in an MSO conditional `v:roundrect` with `fillcolor`, `strokecolor` and a centred `w:anchorlock` text box, as the standard bulletproof-button pattern. Square corners in Outlook are acceptable; contrast is not negotiable.
5. **Logo is a hosted PNG**, absolute https URL on `molly.dfs.vc` (public route, cache headers, immutable URL containing a content hash so a logo change busts caches). No SVG (Gmail, Outlook), no data URIs (blocked), no base64. Set `width`, `height`, `alt`, `border="0"`, `style="display:block"`.
6. **Images off is the default for many recipients.** The header cell must still read as the company: the alt text is styled (`font`, `color: ink`) so the company name shows in the brand shade. The mockup has a "simulate images blocked" toggle.
7. **Dark mode:** Gmail and Apple Mail may invert. Declare `<meta name="color-scheme" content="light only">` and `supported-color-schemes`; set explicit `bgcolor` on every cell (white card) so inversion cannot hide a dark logo. The email logo derivative is already flattened onto its plate.
8. **Fonts:** keep the existing stack and `@import` for clients that honour it. Fallback stacks end in Arial/Calibri so metrics survive.
9. **Preheader and subject:** `"{Company}: {update title}"`. From display name `"{Company} via DFS Lab"`, address unchanged `hello@dfs.vc` (never spoof a company domain).
10. **Escape everything.** Company names and titles go through `escapeHtml`. Colours go through `deriveTheme` which only returns validated `#rrggbb`, so a stored bad value can never inject into a `style` attribute. Validate again at render time.
11. Testing: Litmus/Email on Acid or at minimum manual checks in Gmail web, Gmail iOS, Outlook desktop (Windows), Outlook.com, Apple Mail. Snapshot test the HTML string for a teal and a pale-yellow company.

## 6. Founder settings UI

**Where:** `/company/profile`, edit mode (src/app/company/profile/page.tsx). New card "Investor update branding" directly beneath the existing "Company Logo" card (which becomes the logo control; do not build a second uploader). Same permission as editing the profile (`requireCompanyAccess`). Admins can also edit it from the company page ProfileCard. Writes are audited (`COMPANY_BRANDING_UPDATED`, old and new hex, plate).

**Controls (top to bottom):**
1. Logo thumbnail with Replace; hint "PNG, JPG, SVG or WebP, wider than tall works best."
2. "Logo sits on": segmented White / Your colour.
3. "Accent colour": native colour input (44 x 40) + hex text field (JetBrains Mono, accepts `abc`, `#abc`, `aabbcc`, any case; normalises on blur) + "Reset to default" ghost button. Reset sets the field to the Molly blue and shows "Using the Molly default blue." Saving the default stores `null`.
4. Optional, phase 2: "From your logo" row of up to 4 dominant colours as 26px swatches, extracted client-side from the uploaded image. Cheap and genuinely useful because founders rarely remember their hex.
5. Inline notices (role="status", sand tone, never red): *very light colour*, *looks near grey*, *logo is mostly white*.
6. "How we use it": three rows with swatches stating exactly what changed and the ratio, e.g. "Buttons: #0E828B with white text, 4.58:1. Adjusted from your colour." This is the contrast warning: transparent, informational, never a blocker, and it removes any "why does my button look different" support question.
7. Save bar (primary mono-caps button "Save branding", Cancel, "Unsaved changes" hint). Not sticky in v1.

**Live preview:** right column on desktop (two columns, 340px controls), stacked below on phones. Segmented tabs "Share page / Email". The preview uses the company's most recent update, rendered with exactly the same components and `deriveTheme` as production (so no preview/production drift), updates on every keystroke and picker drag (no debounce needed, it is pure client computation), and carries the footnote "Nothing reaches investors until you save."

**Accessibility:** colour input has an `aria-label`; hex field `aria-invalid` on bad input with the message under it; the preview region is `aria-live="off"` (decorative); segmented controls use `aria-pressed`.

## 7. Footer mark ("Powered by DFS Lab")

Default, shown in every mockup: one centred 11-12px line in muted text (`#66645A`), "Shared via Molly · DFS Lab" on the page and "Sent by {Company} via Molly · DFS Lab" in the email. It sits in the neutral zone, uses no accent, and is the only DFS branding on an otherwise company-themed screen. It doubles as authenticity: an investor who sees it knows the page came from the platform rather than a lookalike. Whether it may be hidden is open (D3).

## 8. Data and plumbing (for the handoff, not for building now)

- `Company.brandColor String?` (lowercase `#rrggbb`, null = default), `Company.logoPlate String @default("LIGHT")` (`LIGHT | BRAND`). Additive, nullable: `prisma db push` before deploy per the ordering lesson in memory.
- `GET /api/share/[token]` returns per company `theme: Theme | null` and `logoUrl`. Page-level theme = the single company's theme only when `companies.length === 1`.
- New public route for email logos (exact-path middleware exemption, like `/brand`).
- Settings PATCH validates with the same normaliser; the server re-derives, never trusts client-sent derived values.
- Logo upload pipeline (stub today): presigned R2 upload (reuse `upload-document`), then server derivatives. Remember R2 CORS if the origin ever changes.

## 9. Open decisions for Joseph

**D1. Multi-company share links.** Options: (a) card-scoped theming with DFS chrome (mockup section 3); (b) no theming on multi-company links at all; (c) theme by the first company. *Recommend (a).* It is honest about whose content is whose, and it makes single-company links, the common founder-sent case, feel fully branded.

**D2. Which email is this?** Molly sends no investor-facing update email today. Options: (a) build a new "send update to my investors" email that carries the themed template and links to the share page; (b) theme only the team-inbox `sendUpdatePublishedEmail` (low value, internal); (c) skip email until investor sending exists. *Recommend (a), scoped as its own piece of work*, since theming the internal copy delivers nothing to founders. The mockup email assumes (a).

**D3. "Powered by DFS Lab" footer.** Options: (a) always shown, small (as mocked); (b) removable by founders; (c) removable by admin per company. *Recommend (a).* It is authentication for investors, costs founders nothing visually, and removing it later is easier than reinstating it.

**D4. Should admins/DFS review a colour before it goes live?** Options: (a) no, the algorithm guarantees legibility; (b) admin sees a notice on change. *Recommend (a) plus the audit entry.* Taste is the founder's; legibility is the system's.

**D5. Pale and neon colours: correct silently or ask?** Options: (a) auto-correct and explain in "How we use it" (as mocked); (b) block anything under 3:1. *Recommend (a).* Blocking makes founders fight a rule they do not understand; correcting keeps their colour where it is safe (button fill, tile) and removes it where it is not (text).

**D6. Logo derivatives storage.** Options: (a) generate once at upload and store two extra keys; (b) generate on request and cache at the edge. *Recommend (a)*: simplest, predictable email URLs, no runtime image dependency in the send path.

**D7. Effect of changing a colour on already-sent emails.** Sent emails keep their original rendering (the logo URL is content-hashed). The share page always shows the current theme, including for old links. *Recommend this*, and say so on the settings card only if founders ask.

**D8. "From your logo" colour suggestions** in phase 1 or later? *Recommend phase 2*; the core picker and preview ship first.

## 10. Suggested build order

1. `brand-theme.ts` + tests (pure, ships alone).
2. Schema columns + settings card with live preview (colour only; logo continues as is).
3. Logo upload pipeline and derivatives (replaces the stub).
4. Share page theming incl. multi-company scoping.
5. Investor email template (after D2).
6. Optional colour suggestions.

## Appendix A. Full reference implementation (plain JS, verified)

Port to TypeScript in src/lib/brand-theme.ts. Pure functions, no dependencies.

```js
const WHITE='#ffffff', PAPER='#ebe8de', DARK='#14140f';
const hex2rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const rgb2hex=r=>'#'+r.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
function lum(h){const [r,g,b]=hex2rgb(h).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*r+0.7152*g+0.0722*b}
function cr(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
function rgb2hsl([r,g,b]){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;if(mx!==mn){const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60}return [h,s*100,l*100]}
function hsl2hex([h,s,l]){s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return rgb2hex([f(0)*255,f(8)*255,f(4)*255])}
function mix(a,b,t){const x=hex2rgb(a),y=hex2rgb(b);return rgb2hex(x.map((v,i)=>v+(y[i]-v)*t))}
function darkenUntil(hex,ok,maxSteps=100){let [h,s,l]=rgb2hsl(hex2rgb(hex));let n=0;while(!ok(hsl2hex([h,s,l]))&&l>0&&n<maxSteps){l-=1;n++}return {hex:hsl2hex([h,s,l]),steps:n}}
function deriveTheme(input){
  const brand=input.toLowerCase();
  const tint=mix(brand,WHITE,lum(brand)>0.6?0.45:0.88);
  // fill + on
  let fill=brand,on,fillNote='as picked';
  if(cr(WHITE,brand)>=4.55){on=WHITE}
  else{const d=darkenUntil(brand,c=>cr(WHITE,c)>=4.55,12);
    if(cr(WHITE,d.hex)>=4.55){fill=d.hex;on=WHITE;fillNote='darkened '+d.steps+' pts for white text'}
    else if(cr(DARK,brand)>=4.55){on=DARK;fillNote='dark text on your colour'}
    else{const d2=darkenUntil(brand,c=>cr(WHITE,c)>=4.55);fill=d2.hex;on=WHITE;fillNote='darkened '+d2.steps+' pts for white text'}}
  const ink=darkenUntil(brand,c=>Math.min(cr(c,WHITE),cr(c,PAPER),cr(c,tint))>=4.55).hex;
    const mark=darkenUntil(brand,c=>Math.min(cr(c,WHITE),cr(c,PAPER))>=3.05).hex;
  const band=Math.min(cr(brand,WHITE),cr(brand,PAPER))>=1.3?brand:mark;
  const needsEdge=Math.min(cr(fill,WHITE),cr(fill,PAPER))<3.05;
  const hover=(()=>{const d=darkenUntil(fill,()=>false,0);let [h,s,l]=rgb2hsl(hex2rgb(fill));const c=hsl2hex([h,s,Math.max(0,l-6)]);return cr(on,c)>=4.55?c:fill})();
  return {brand,fill,on,fillNote,ink,tint,mark,band,needsEdge,hover,edge:mark}
}
```
