# v3 manifest: every final file, what it is for, where it is installed

Status: directions decided 2026-10-13. Nothing is installed yet and nothing is committed; this is the install list for Alvin (Molly) and for whoever sets up the Marge repo.
Paths in the first column are relative to `docs/design/brand-assets/v3/`. `{a,b}` means one row covers each of those files.

Destinations:
- **Molly**: `/Users/josephbenson/GitHub/duluth` (Next.js app router: `src/`, `public/`).
- **Marge**: `/Users/josephbenson/GitHub/marge` (Next.js app router at the repo root: `app/`; there is no `public/` yet). Her brand reference files go in `brand/`.

Round 3b (2026-10-13) regenerated Marge's marks, lockups, icons, favicons, avatars, colour options and PNGs (her bubble now has a folded tail), the Molly OG card (final copy) and `family-icons`. Both wordmarks, the Molly marks, icons and email header, and the family lockups did not change.

## Read first: Molly's icons go in `public/`, not `src/app/`
`src/middleware.ts` runs on every path except `_next/static`, `_next/image`, `favicon.ico` and `favicon.png`, and `src/lib/route-access.ts` makes only `/`, `/login`, `/signup`, `/set-password`, `/share`, `/investors`, `/lp`, `/brand` and a few API paths public. Next's file-convention icons (`src/app/icon.svg`, `src/app/apple-icon.png`) are served at `/icon.svg` and `/apple-icon.png`, which are not public, so a signed-out visitor's browser would be redirected to `/login` instead of getting the icon. Anything an outside system fetches (favicon, apple-touch, email header, OG card) must live at `public/favicon.ico` or under `public/brand/`.

## Molly: install into `/Users/josephbenson/GitHub/duluth`

| File | What it is for | Install as |
|---|---|---|
| `molly/molly-favicon.ico` | favicon, 16, 32 and 48 as PNGs | `public/favicon.ico`. Delete `public/favicon.png` (the bare DFS bar) |
| `molly/molly-icon-favicon.svg` | SVG favicon on a 32 grid (crisp at 16, 32, 48) | `public/brand/molly-icon.svg` |
| `molly/png/molly-apple-touch-180.png` | iOS home-screen icon | `public/brand/molly-apple-touch-180.png` |
| `molly/png/molly-icon-512.png` | 512 icon for a future web manifest or app listing | `public/brand/molly-icon-512.png` (optional until a manifest exists) |
| `molly/molly-wordmark.svg` | primary logo, `_Molly` | inline SVG in `src/components/ui/logo-mark.tsx`, sized by height (20px nav, 22px login header). That one component feeds `src/components/auth/auth-layout.tsx`, `src/components/layout/sidebar.tsx`, `src/components/layout/app-shell.tsx`, `src/app/page.tsx`, `src/app/investors/page.tsx` and `src/app/share/[token]/page.tsx`. Never retype it in CSS |
| `molly/png/molly-email-header@2x.png` | email header: the DFS logo and `_Molly` in one opaque image on Paper, 320 x 58 shown at 160 x 29 | `public/brand/molly-email-header.png` (no `@` in a served URL). In `src/lib/email.ts` it replaces the DFS logo `<img>` and the "Molly · Portfolio Platform" span; alt text "Molly, from DFS Lab"; make the path env-overridable like `EMAIL_LOGO_PATH` |
| `molly/png/molly-og-card.png` | Open Graph and Twitter card, 1200 x 630, final copy | `public/brand/molly-og-card.png`, used as `openGraph.images` and `twitter.images` in `src/app/layout.tsx` with an absolute URL (so `metadataBase` is `https://molly.dfs.vc`) |

Shape of the metadata change in `src/app/layout.tsx` (strings from `COPY.md`; this is the shape, not code to paste):
```
title: { default: <root title>, template: "%s | Molly" }
description: <meta description>
icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/brand/molly-icon.svg", type: "image/svg+xml" }],
         apple: "/brand/molly-apple-touch-180.png" }
openGraph.images: [{ url: "/brand/molly-og-card.png", width: 1200, height: 630, alt: "Molly, from DFS Lab" }]
twitter: { card: "summary_large_image", images: ["/brand/molly-og-card.png"] }
```

### Molly: kept in docs, not installed
| File | What it is for |
|---|---|
| `molly/molly-wordmark-reverse.svg` | `_Molly` on Obsidian. The product has no dark mode, so nothing uses it yet |
| `molly/molly-wordmark-plain.svg` | the name without the underscore, for lockups where the underscore is the seam between two names |
| `molly/molly-mark.svg`, `molly/molly-mark-reverse.svg`, `molly/molly-mark-mono.svg` | the three-tile mark on Paper, on Obsidian, and in one colour. Install under `public/brand/` the day a surface needs it (empty states, the future wall) |
| `molly/molly-lockup.svg`, `molly/molly-lockup-reverse.svg` | mark plus name, secondary to the wordmark |
| `molly/molly-icon-512.svg` | source for the 512 and 180 PNGs |
| `molly/molly-icon-favicon-{16,48}.svg` | the 16 and 48 pixel-grid sources behind the `.ico` |
| `molly/png/molly-favicon-{16,32,48}.png`, `molly/png/molly-icon-72.png` | the PNGs inside the `.ico`, and a 72 preview |
| `molly/png/molly-email-header@1x.png` | 160 x 29 fallback; the 2x image displayed at 160 x 29 is enough |
| `molly/molly-email-header.svg` | source of the email header images |
| `molly/molly-og-card.svg` | source of the OG card. Its text is outlined, so changing copy means regenerating it |
| `molly/png/molly-wordmark@2x.png`, `molly/png/molly-lockup@2x.png` | padded PNGs for slides and documents |
| `molly/molly-mark-construction.svg`, `molly/molly-wordmark-guides.svg` | construction drawings (they carry live text labels, so they are for reading, not for shipping) |
| `molly/brand-spec.md` | the Molly kit spec |

## Marge: install into `/Users/josephbenson/GitHub/marge`

Copy the kit into `brand/` keeping the structure, so the relative links in her spec still work:
- `marge/` as `brand/marge/` (everything, including `png/` and `options/`)
- `brand-spec.md` (the family spec) as `brand/brand-spec.md`
- `COPY.md` as `brand/COPY.md`
- `concepts/marge/` as `brand/concepts/marge/` (optional archive)

The links to Molly's kit and to round 2 inside `brand/marge/brand-spec.md` will not resolve in that repo; that is expected.

Then copy these three into the app (Next picks them up by file convention; the Marge repo has no middleware, so they are public):

| File | What it is for | Install as |
|---|---|---|
| `marge/marge-favicon.ico` | favicon, 16, 32 and 48 as PNGs | `app/favicon.ico` |
| `marge/marge-icon-favicon.svg` | SVG favicon on a 32 grid | `app/icon.svg` |
| `marge/png/marge-apple-touch-180.png` | iOS home-screen icon | `app/apple-icon.png` |

When the landing page (`app/page.tsx`) gets a header, inline `marge/marge-wordmark.svg` (or `marge/marge-lockup.svg` for the avatar plus name), sized by height. Do not retype the wordmark.

### Marge: upload by hand
| File or text | Where it goes |
|---|---|
| `marge/png/marge-slack-avatar-512.png` | Slack app icon (api.slack.com, the app's Basic Information, Display Information). Square, full bleed; Slack rounds it. I recall Slack wants a square PNG between 512 and 2000 px: check the page |
| `COPY.md`, Marge section: Slack display name, short description (108 characters), long description (764) | the same Display Information form, and the bot display name |
| `marge/png/marge-telegram-avatar-512.png` | BotFather `/setuserpic`. Upload the square; Telegram crops it to a circle and the mark is sized to stay inside |
| `COPY.md`, Marge section: Telegram bio (97) and description (219) | BotFather `/setabouttext` and `/setdescription` |

If the Slack form asks for an app background colour, Clay #B56D44 is the colour (4.0:1 against white). I have not checked whether Slack enforces a higher contrast for white text on that card; if it does, Laterite #A65A3E (5.1:1) is the fallback.

### Marge: kept in `brand/`, not installed anywhere
| File | What it is for |
|---|---|
| `marge/marge-wordmark.svg`, `marge/marge-wordmark-reverse.svg`, `marge/marge-wordmark-plain.svg` | primary logo `_Marge` on light and dark grounds, and the name without the underscore. Identical to round 2 |
| `marge/marge-mark.svg`, `marge/marge-mark-reverse.svg`, `marge/marge-mark-mono.svg` | the bubble on Paper (Clay, Laterite tail), on Obsidian (Paper, Cocoa tail), and in one colour |
| `marge/marge-lockup.svg`, `marge/marge-lockup-reverse.svg` | Clay tile plus the name, on light and dark grounds |
| `marge/marge-icon-512.svg`, `marge/png/marge-icon-512.png` | web icon source and PNG, same art as the Slack avatar |
| `marge/marge-icon-favicon-{16,48}.svg` | the 16 and 48 pixel-grid sources behind the `.ico` |
| `marge/png/marge-favicon-{16,32,48}.png` | the PNGs inside the `.ico` |
| `marge/marge-slack-avatar-512.svg`, `marge/marge-telegram-avatar-512.svg` | sources of the two uploaded PNGs |
| `marge/png/marge-slack-avatar-{72,36}.png` | previews of the Slack avatar at message size |
| `marge/marge-slack-avatar-small-512.svg`, `marge/png/marge-slack-avatar-small-{40,20}.png` | the cut for 24px and under (larger bubble, Paper tail, Obsidian line). Slack scales the one uploaded icon, so this is only for interfaces we own that draw her at 24px or less |
| `marge/options/marge-avatar-{baobab,clay,laterite}-512.svg`, `marge/options/marge-avatar-{baobab,clay,laterite}-small-512.svg` | the three colour options, kept for reference now that Clay is chosen |
| `marge/png/options/marge-avatar-{baobab,clay,laterite}-512.png`, `marge/png/options/marge-avatar-{baobab,clay,laterite}-72.png`, `marge/png/options/marge-avatar-{baobab,clay,laterite}-small-40.png` | PNGs of the three options |
| `marge/png/marge-wordmark@2x.png`, `marge/png/marge-lockup@2x.png` | padded PNGs for slides and documents |
| `marge/marge-bubble-construction.svg`, `marge/marge-fold-states.svg`, `marge/marge-wordmark-guides.svg` | construction, the five motion states (flat, folded, writing, written, kept) and wordmark guides (they carry live text labels, so they are for reading, not for shipping) |
| `marge/brand-spec.md` | the Marge kit spec, including the motion timings |

## Family files
| File | What it is for | Install |
|---|---|---|
| `family-lockup.svg`, `family-lockup-reverse.svg` | `_DFS _Molly _Marge` at one cap height, on Paper and on Obsidian | not installed; for decks and the brand page |
| `png/family-lockup@2x.png` | padded PNG of the family lockup | not installed; presentation use |
| `family-icons.svg`, `png/family-icons@2x.png` | the three icon tiles side by side | not installed; presentation use |
| `brand-spec.md` | the family spec: the module, the shared rules, where B bends the system, the handoff | stays in duluth `docs/design/brand-assets/v3/`; also copied to the Marge repo as `brand/brand-spec.md` |

## Copy
| File | What it is for | Install |
|---|---|---|
| `COPY.md` | the final copy: Molly's strings (root title, meta description, OG headline and subline, tagline, login line, email alt and footer) and Marge's (Slack and Telegram texts, her lines, eight sample replies, the voice guide) | **duluth**: stays in `docs/design/brand-assets/v3/`; Alvin implements the Molly strings: `src/app/layout.tsx` (title, description), `src/app/login/page.tsx` line 48 (login line), `src/lib/email.ts` (header alt and footer). The OG headline and subline are already outlined in `molly/png/molly-og-card.png`. **marge**: copy the whole file to `brand/COPY.md`; the Marge section is the source for the Slack and Telegram form fields and for her first-DM, refusal and "I don't know" lines |

Note from `COPY.md`: its strings assume `ORG_NAME` reads "DFS Lab". In `src/lib/org.ts` it defaults to "DFS", so check the live env value before relying on the footer wording.

## Exploration (not installed)
| Folder | What it is for |
|---|---|
| `concepts/molly/` | eight Mosaic candidates and why seven lost |
| `concepts/marge/` | seven earlier shapes (the last is the superseded round 3a folded corner) and the five round 3b speech-bubble variants: folded tail (chosen), Paper tail, round body with tail, capsule body, split tail |

## Specs
`brand-spec.md` (family), `molly/brand-spec.md`, `marge/brand-spec.md`. The live preview is https://claude.ai/artifact/Trth4wZeZqTuXPBgZbJbWr (private).

## Checks run on these files
- Every SVG parses. Marks, wordmarks, lockups, icons, avatars and the OG card are outlines with no live text; only the construction, states and guide drawings carry text labels.
- PNG sizes verified: favicons 16, 32 and 48; apple-touch 180; avatars 512, 72, 36, 40 and 20; email header 160 x 29 and 320 x 58 (opaque RGB); OG card 1200 x 630.
- Marge viewed as exported PNGs at 512, 36 and 20 pixels on Slack light (#FFFFFF) and Slack dark (approximated as #1A1D21 from memory, not sampled), and as a Telegram circle crop.
- Not checked: a real Slack workspace, Telegram, Gmail or a browser tab; `.ico` files across browsers.
