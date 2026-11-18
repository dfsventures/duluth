# Memo page, concept v1

Status: **proposal for Joseph, 2026-11-18. Nothing is built.** Author: Nisat. Board card B-175. Mockup: `docs/design/memo-page-v1.html` (open in a browser; no build step). All names, figures and text in it are made up.

The mockup has three directions (A, B, C), light and dark, **Desktop / Phone / Print**, and two switches for things that need Joseph's eye: "Show round and ask" and "Show link company banner". It uses a 15-section memo, several of them long. Everything uses the approved system: Lou-style layout, Inter, cool greys, Molly Sky, the Sky underscore cursor, no left-edge bars, sizes from `redesign-v1-density.md`. The one new size is the memo title: 24/32, semibold (the pane title is 20/28; a full page title can be a step up).

## What is wrong today, and what every direction does about it

| Problem | Fix in all three |
|---|---|
| Reads like a form: three dropdowns come first | Title first, then the facts. Stage and Memo status become two coloured chips you click (they open a menu); Visibility becomes "Access". Nothing is a bordered form control any more. |
| Empty band, contents starting halfway down | The contents list is now in the first screen: in A as a left rail, in B inside the right-hand deal panel. |
| History and Edit on all 13 sections | Both appear on hover or keyboard focus of one section, at the right of its heading. Phone and touch: one ⋯ button per section (Edit, History). Nothing is removed. |
| No deal at a glance | A facts strip (A, C) or a deal panel (B) with Stage, Memo status, Access, Source, Intro date and how long ago, Website, Tags, Intro calls. Owner and updated date stay under the title. |
| Wall of text | Every section folds (click its heading; a folded section shows its first sentence). Long sections are cut to about 8 lines with "Show all 1,240 words". Each heading shows a word count. Fold all / Unfold all above the first section. |

The header bar now holds **Share** (the one primary) and a ⋯ menu with Edit details, Change company (or Link to company), Print or save as PDF, Archive memo. The big "Archive memo" button at the foot of the page stays. When scrolled, the memo title and current section fade into the header bar.

## The three directions

**A · Brief.** A single reading column with a facts strip across the top and a contents rail on the left (the active section has a small Sky underscore, not the old left border). The closest to today's page, and the safest. It spends the least new space: the right-hand ~180px stays empty on a wide window.

**B · Dossier.** Reading column on the left (720px), a sticky "deal panel" on the right (296px). The panel carries every fact and control from the old Details box plus the contents list, so the facts never scroll out of sight while you read. Under the title, one quiet line repeats the three facts you want most: stage, status, source, intro age. On narrow windows the panel moves above the text and the contents become a "Jump to" bar.

**C · Outline.** Scan first, read second. A one-line facts strip, then each section is a 44px row (number, title, first sentence, word count, last edited), exactly like a Molly list, with the Sky underscore as the keyboard cursor (`j`/`k`, Enter to open, `e` to edit). Sections open inline. Everything starts closed except Summary. "Open all" turns it into a document.

## Recommendation: B, Dossier

It answers the most complaints with the least learning. The facts are always visible and sit where the empty band was, so space is used and the text column stays at a good reading width. Sections fold and long ones are cut, so scanning works too. A is a smaller step from today and leaves the right side empty. C is the best way to scan 13 sections but the worst way to read one memo front to back, and hiding all text behind rows changes the page's job. If Joseph likes C, its outline could later become B's contents list.

## What is new versus today

- **Moved:** Stage, Memo status and Visibility leave the page top and live in the facts (chips, not selects). The collapsed "Details" box is gone; its content is shown always (source, intro date, website, tags, intro calls). Print, Archive, Edit details and Change company move into the header ⋯ menu.
- **New, no data needed:** facts strip or panel; per-section fold; "Show all" on long sections; word count and first-sentence summary per section; the memo title in the header bar once scrolled; Fold all / Unfold all; hover or focus Edit and History; a short summary line under the title (B).
- **Still there, unchanged:** the link-company banner, "Hidden from share links" (still opens Share), "Drafted by Marge", the Edit sheet, Share panel, the section editor with Write/Preview, citations and the include-in-share box, the conflict banner, section History with Restore, print.

## Data that does not exist

The Memo model has **no round, ask, valuation, sector or lead investor field**. I checked `prisma/schema.prisma`. "Round" and "ask" are only there if someone writes them in a section. What the facts use today is real: stage, status, visibility, source, intro date, website, tags, intro calls, owner, updated. The switch **"Show round and ask"** shows where two new facts would go, outlined and labelled as needing new fields. Options if you want them: (1) two new optional fields on the memo (Alvin, a schema change and a db push), and Marge fills them when she drafts; or (2) leave them out, and use Tags as the sector. "Sector" I mapped to Tags.

Also not stored: who last edited a section and when (the mockup's C rows show "edited Nov 12"). The revision table has it, so it needs a small read, but no new storage.

## Phone

Layout is driven by the content width, so the phone view is the same markup. Header: back, Share, ⋯. The deal panel (B) or facts strip (A, C) sits above the text. Contents become a sticky "Jump to" bar showing the current section; tapping it lists all sections. Section Edit and History sit behind a 44px ⋯. Folds work the same.

## Print

Printing stays a plain white page in every direction and in dark mode: no controls, no folds, no cuts, every section open, black on white (the Print button in the mockup shows it, and the print stylesheet forces the light values). Same content as today: title, "Stage · Memo status", owner and date, "Drafted with Marge", the details, then the sections. Today's page does not remove "Hidden from share links" sections from print; I kept that (question 5).

## Build notes for Alvin

- Facts are plain reads of `MemoView`; no API changes. Stage and Memo status keep their existing handlers (optimistic Stage change, 409 message, status PATCH).
- Fold state is local and not saved. Open question 3.
- Replace the section nav's `border-l-2` active marker with the underscore (it breaks the no-left-bar rule).
- Section Edit/History: reveal on `:hover` and `:focus-within`; always visible when `(hover: none)`; the narrow ⋯ replaces them under about 900px of content width (a container query, as in the lists).
- The right panel in B is sticky with `top: 24px`. With 15 sections the contents list scrolls inside it on a short window; check at 1280×720.
- Check in the mockup with the keyboard: Tab to a section, History and Edit appear.

## Open questions for Joseph

1. Which direction: B (my pick), A, or C?
2. Do you want round and ask on a memo? If yes, I'd make them two optional fields, filled by Marge from the deck. If no, the facts stay as shown.
3. Should folded sections be remembered per person? Default is no: every visit starts with everything open, long sections cut short.
4. Edit and History only on hover or focus: fine for you? The cost is that a new person has to know to hover. On a touch screen they are always shown.
5. Should sections marked "Hidden from share links" print? Today they do; the print is for the team, but you might expect the same as share.
6. Is "Access" the right word for Private / Shared with team? Nosa should check this and the "Show all N words" wording.
