# Admin new look: design audit v1

Audit of every admin page in the new look, written after the shared page frame (d078cad). One numbered punch list for approval before any fix is built. Design review only: nothing in this file has been built.

**How it was done.** Screenshots at 1440, 1920 and phone, light and dark, in the new look; the old-look shots beside them; the live screenshots taken before the frame (broadcast draft, broadcast audience, sent broadcast, Settings, report preview); the three design docs (`redesign-v1.md`, `redesign-v1-density.md`, `memo-page-v1.md`); and the page code. The broadcast, report and update editors cannot render locally (a dev-only editor error), so for them I used the live screenshots plus the code. Sizes below follow the density doc: gutter 24 (64 at 1920), bar 52, row 44, button and input 36, chip 28, spacing steps 4 / 8 / 12 / 16 / 24 / 32 / 48, text 14 (12 for metadata only).

**Placeholders.** This repo is public. Company, person and fund names are placeholders or left out.

**Severity.** *Must fix* = broken, a leftover, or clearly poor. *Should fix* = inconsistent. *Nice to have* = polish.

**Flag: changes behaviour.** A finding marked **[BEHAVIOUR]** changes what a page shows or does, not only how it looks. These need a separate yes or no. Everything else is look only.

---

## Summary

Counts: **6 Must fix, 31 Should fix, 9 Nice to have (46 findings).**

### The problems that matter most

1. **The same thing is drawn in several ways on one page.** The broadcast audience list is grey-filled rows with a rounded box; "Who will receive this" is a bordered box with a different row height and type size; the Investor Links picker is a third variant. Same pattern: the dashboard (grey tiles next to bordered chart cards), the fund page (a bordered, grey-filled performance box next to a fill-only side panel), the Team Board banner (a 1px amber outline where every other notice has no border). (#1, #2, #5, #15, #31, #36)
2. **The top of the page is not one thing.** Content starts 72px, 88px or 104px under the header bar depending on the page, and there are four different top-of-page treatments (sticky bar, breadcrumb plus status line, "← All digests" plus title, Dossier back link). The digest page has its actions wrapping onto two rows. (#7, #8, #46)
3. **Leftovers from the old look that were not carried over.** A disabled Send on a sent broadcast; "Unpublish to edit" as a primary button; mono small-caps stat labels on the Deal Ledger; mono expiry text on Approvals; raw `COMPANY_IMPORT_COMPLETED_WITH_…` codes in the Audit Log; a warning dot with no label on the company ledger page; two glyphs on one status. (#3, #12, #22, #26, #32, #41)
4. **The report preview is not a page.** It has no header, no way back to the editor, and a large cream block with a border and rounded corners that glares in dark mode. (#29)
5. **Things were moved into the pane with no equivalent in the list.** Investor Links lost Copy link, the view count button and Revoke from the row. They exist in the pane, but copying a link now takes two clicks, where the old look took one. (#37) **[BEHAVIOUR]**
6. **Fund detail clips its table.** The deals table is cut off at the right edge, with a half-visible column header, because it shares a column with the side panel. (#30)
7. **Settings spends its first screen on a five-row status list** and then sets paragraphs in 12px. (#43, #44)
8. **Service Providers is two tables that do not line up**, with the second one labelled "All providers" even though it leaves out the pending ones. (#40)

### Shared fixes: one change, many pages

Prefer these over page patches.

| Shared change | Fixes findings | Where |
|---|---|---|
| **One `PickerList` component** (hairline rows, no fill, no outer rounded box, checkbox or no checkbox, optional group rows) | #1, #2, #38 | Broadcast audience, "Who will receive this", Investor Links picker |
| **One list top edge**: content starts 24px under the header bar on every page | #7 | `.shell-header` margin plus removal of per-page top padding |
| **One `Notice` component** (tone prop, no border, 14px text, 16px side padding) | #5, #27, #36 | All 13 admin files that still carry `border-ochre`, `border-laterite/30` or `border-destructive/30` |
| **One `Stat` component** (sentence-case 12px label, 20/28 sans number, no box) | #13, #15, #31 | Dashboard, Deal Ledger, Fund performance |
| **Badge in the new look draws only the dot or triangle** (hide the extra icon inside `.badge`) | #3 | Service Providers, Digest, any `Badge` with an icon |
| **Two page-top patterns only**: Record header (back link, title, actions top right) and Form header (the 52px bar with a title and one primary action) | #8, #29, #45, #46 | Digest, New memo, Memo template, Add company, editors, report preview |
| **DataTable**: no × on the "All" chip, optional `minRowsForFilter`, optional shared column template for stacked tables | #4, #14, #16, #40 | Every list |
| **Use the existing `filter-bar.tsx`** on Memos, Team Board, Deal Ledger, Updates, Reports | #10, #36 | Five pages |

### Decisions for approval (marked [BEHAVIOUR] below)

- #37: Copy link back in the Investor Links row (adds a row action).
- #24 and #25: a sent broadcast shows who it reached, and Message / Delivery tabs.
- #43: a healthy Settings page shows one line instead of five rows.
- #14 and #18: hide the filter on short tables; one filter on Approvals.
- #41: Audit Log shows readable labels and names instead of codes and ids.
- #40: Providers pending rows as a group in one table, plus a rename of "All providers" (Nosa).
- #42: Portfolio Contacts, where the CSV format note and the count live.
- #33: Deal Ledger detail section order, and Contacts inputs hidden until "Add contact" is clicked.
- #44 (layout only): Settings with the tabs as a left rail, using the width better.

### Observation, no change proposed

The left edge of the page title is 288px on lists, 424px on the fund page, 544px on record pages (Dossier) and 712px on forms, Settings and editors at 1920. That is the frame working as designed: lists fill, records and forms are centred reading columns. I would keep it. The one place it hurts is Settings (#44).

---

## Findings

### All pages (shared)

**1. Pickers: two list styles on one page** · *Must fix* · Broadcast editor, Investor Links form, company pickers

Wrong: the audience rows are `bg-primary/5` when selected, so with everything ticked the whole list reads as grey-filled rows. The "Who will receive this" list under it is a rounded, bordered box with a different row height and a smaller, mono email. The Investor Links picker has a third variant (rounded box, uppercase grey group bands). Old look: the same code, but the old look had no hairline system to clash with.

Fix: one `PickerList`. Rows 40 high, 16px checkbox, label 14/20, right-hand meta 12/18 muted (contact count, company name). Hairline between rows, nothing else: no fill (selection is the checkbox only; hover is the standard row hover), no rounded outer box, a hairline above and below the list, no side borders. Max height 320 with its own scroll. The read-only "Who will receive this" is the same component with no checkbox, with the email in the sans 12px style (not mono). Group rows (Investor Links, by company) are 32 high, sentence-case 12/18 medium, no uppercase, no fill. The "0 contacts" count keeps the amber tone.

**2. Audience block has no hierarchy** · *Should fix* · Broadcast editor (draft)

Wrong: "Audience" is a 12px label, the summary under it is 14px, the "Who will receive this" toggle is 12px. Nothing says which line is the heading. Search field, Select all and Clear sit on one row with the label, so the label drifts when the window narrows.

Fix: heading row: "Audience" 14/20 medium on the left, "54 selected" 12/18 muted on the right. Next row (12 under): search (36 high, 240 wide), Select all (secondary, 36), Clear (ghost, 36), then "Hide companies with no contacts" as a checkbox on the same row at 1440 and up. Then the list (#1). Then the two summary sentences at 12 under, 14px. "Who will receive this" as a disclosure at 16 under, 14px medium with a chevron, not 12px.

**3. Status shown with two glyphs** · *Should fix* · Service Providers, Digest detail, any `Badge` with an icon

Wrong: "▲ ⏱ Pending", "● ✓ Vetted", "● ⊗ Rejected", "▲ ⏱ Draft". The new-look badge already draws a dot or triangle; the icon passed in by the page adds a second glyph. The density doc says a status is one small glyph and a word.

Fix: in the new look, hide `svg` children of `.badge` (one CSS rule in the v2 badge block). Pages need no change. Keep the glyph only for success, warning and danger, as it is.

**4. The "All" filter chip has a ×** · *Should fix* · Every list with chips (Broadcasts, Reports, Funds detail tabs, Deal Ledger, Links)

Wrong: "All 2 ×" looks like a filter you can remove. Removing "All" does nothing useful.

Fix: the "All" chip never shows ×. Selected = filled `--color-surface` with the accent text, as now. Only the dashed "+ Draft 1" chips become removable once chosen.

**5. Alert banners keep the old bordered style** · *Should fix* · Team Board (needs review), Approvals, Providers, Diligence, Investor Links, Portfolio Contacts, New digest, Digest detail, Broadcast editor, Report editor, Deal Ledger detail, Settings (email and storage)

Wrong: 13 admin files, 23 places still use `border-ochre`, `border-laterite/30` or `border-destructive/30`. Some pages already override them with `v2:border-transparent v2:bg-tone-amber`; the Team Board banner (`rounded-sm border border-ochre bg-ochre/10`) does not, so it shows a 1px amber outline in a page that has no other outlines.

Fix: one `Notice` component with a `tone` (amber, clay, sky). Height 40 minimum, padding 12 / 16, radius = control radius, tone fill from the tone tokens, no border, 16px icon, text 14/20, action as a small ghost-on-tone button on the right. Replace all 23.

**6. Search fields have two fills** · *Nice to have* · DataTable pages (white) against Memos, Team Board, Settings and forms (grey)

Wrong: the list filter field is white with a control border; the search fields on Memos and the Team Board are grey-filled with the same border. Both are "type to narrow", drawn two ways.

Fix: one rule. A field that filters what is below it is transparent with the 1px control border (as on the DataTable pages). A field that holds a value you will save keeps the `--color-surface` fill (as on forms). Apply to Memos and Team Board search.

**7. Content starts at three heights** · *Should fix* · All list and tabbed pages

Wrong: the first line under the header bar sits at 72px on Approvals, Diligence and Investor Links, 88px on Funds, LPs, Broadcasts, Reports, Digest and Audit, and 104px on Portfolio Contacts, Memos and the tab pages. Moving between pages makes the content jump 16 to 32px. The pages that open the pane (SplitView) differ from the ones that do not.

Fix: one rule. The first element under the 52px bar starts 24px below its hairline (so at 76px) on every list and tabbed page. Implement it once as the `.shell-header` bottom margin, and remove the extra top padding that `SplitView`, `TabBar` and the page wrappers add. Check at 1440, 1920 and phone.

**8. Four different tops for form and record pages** · *Should fix* · Digest (new, detail), New memo, Memo template, Add company, broadcast and report editors, Settings

Wrong: Settings and the list pages use the 52px sticky bar. New memo and Memo template stack a breadcrumb above a small bar with a rule under it. Add company puts a "Back to Companies" button in the bar. Digest pages use "← All digests" plus a plain h1. The editors use a breadcrumb plus a status line that scrolls away.

Fix: two patterns only. **Form header** = the standard sticky 52px bar: title, one-line description, one primary action on the right. Back is a quiet "‹ Memos" link before the title, at the same 14px as the title (no separate breadcrumb row). Used by New memo, Memo template, Add company, New digest, Settings. **Record header** = the Dossier one (back link above, title 24/32, actions top right with the primary and a ⋯ menu). Used by Digest detail and by the broadcast and report editors, which also keep their status line ("Draft", "Sent Oct 21 by …").

**9. Tab icons are inconsistent** · *Should fix* · Updates, Portfolio Contacts (icons); Memos, Team Board, Settings (no icons); Company page (icons and counts)

Fix: page-level tabs are text, with an optional count. No icons. Record tabs on the company page may keep an icon plus count, since they were already approved in the Dossier pattern.

**10. Two filter styles** · *Should fix* · Memos (list and board), Deal Ledger, Updates, Reports, Team Board

Wrong: the DataTable pages use a white filter field with dashed chips. Memos uses a wide grey-filled search plus two grey selects plus a toggle. Deal Ledger and Updates have grey selects with dark borders; Reports has an outlined one. The Team Board is a labelled form (Project, Owner, Search, each with a label above).

Fix: use the existing, unused `filter-bar.tsx` on these pages: filter field 240 wide, selects as 36-high outlined controls with no fill, in one 44px bar, with the view or export buttons at the far right. Labels go inside the select as the placeholder ("All companies"), not above.

**11. Selected segment has no weight** · *Should fix* · Add company ("Assign user"), any segmented button group

Wrong: "None" is selected only by blue text on a white button. It is the one place a state hangs on colour alone.

Fix: a selected segment gets `--color-surface` fill, a 1px `--color-ctl` border and 500 weight. Unselected: transparent with a hairline.

**12. Mono caption leftovers** · *Should fix* · Approvals (expiry), Deal Ledger (stat labels), Fund detail (figures), New digest (textarea)

Wrong: mono text in a few places where the new look uses Inter. These are the old look's accents.

Fix: sans everywhere in the admin. Expiry becomes 12/18 sans, `expired Nov 13, 2026` in the clay tone. The digest textarea is sans 14 (a pasted link list does not need mono).

**13. KPI figures drawn three ways** · *Should fix* · Dashboard, Deal Ledger, Fund detail

Wrong: the dashboard uses grey tiles with a sentence-case label; the Deal Ledger a flat strip with mono caps labels; the fund page a bordered grey box with mono figures.

Fix: one `Stat`: label 12/18 sentence case grey, number 20/28 semibold sans with tabular figures, caption 12/18 muted. Five up in a strip with 32px between, no box, no border, a 16px bottom margin to the table. If the dashboard tiles are preferred, give the other two the same tile (fill, no border, radius 8, padding 16); either way, one style.

**14. Filter bar on tables with two rows** · *Nice to have* **[BEHAVIOUR]** · Funds, LPs, Investor Links, Diligence, Digest, Broadcasts, Reports

Wrong: a search field and chips above a table with one to three rows is chrome with nothing to find.

Fix: DataTable gets `minRowsForFilter` (default 8): below that, no filter field, no chips. Keyboard `/` still opens the palette. This changes what the page shows when the list is short.

### Dashboard (Needs you)

**15. Two card styles in the Portfolio section** · *Should fix*

Wrong: KPI tiles are grey fill with no border; the two chart cards below are bordered with no fill and have dashed vertical gridlines.

Fix: chart cards take the tile's treatment: `--color-surface` fill, no border, radius 8, padding 16 / 24. Chart: horizontal gridlines only, hairline colour, no dashes.

### Approvals

**16. Three tables, three heading styles, three column grids** · *Should fix*

Wrong: the first table has no heading at all; "Awaiting password setup" has a 14px bold heading plus a grey 14px description; "Dismissed / stale (5)" is a grey regular-weight heading. The three tables use different column positions (Person, Email, Company / Person, Company, Setup link / Person, Company, State), so the right-hand action buttons end at different x positions.

Fix: each section gets the same heading: 14/20 medium, count in grey 12/18 after it (for example "Pending approval 3"), description at 4 under, table at 12 under, 48 between sections (the density doc's section recipe). The three tables share one column template: Person (flex), Company (240), Detail (200), Actions (right-aligned, 280). Pass one template to all three DataTables.

**17. Actions on the password-setup rows** · *Should fix*

Wrong: Resend link, Dismiss and Delete are three equal text buttons, so Delete sits next to Dismiss with the same weight.

Fix: Resend link stays visible as the only text button. Dismiss and Delete go into a ⋯ menu (Delete in the clay tone, last). Same actions, same confirm.

**18. Three search fields on one page** · *Nice to have* **[BEHAVIOUR]**

Wrong: each table has its own filter field.

Fix: one filter at the top of the page that filters all three tables, and none on a table below it. This changes what Approvals does when you type. Alternative with no behaviour change: hide the filter on the two small tables (#14).

### Updates

No findings beyond the tab icons (#9) and the company select (#10).

### Broadcasts (list)

No findings beyond the shared ones. The list carries over the old look: the old trash button is now the row's hover action, and Sent to N contacts is the Recipients column.

### Broadcast editor (draft)

Beyond #1, #2 and #8:

**19. Send is disabled with no reason** · *Should fix*

Wrong: with an empty body and nothing ticked, Send and "Send test to me" are both pale and no text says what is missing. A pale primary beside a pale secondary is also hard to tell apart.

Fix: when Send is disabled, a 12/18 muted line sits under the bar's actions: "Add a message and pick at least one company to send." The disabled primary stays visible. "Send test to me" stays a secondary button, enabled as soon as there is a subject and a body.

**20. Composer bar scrolls away** · *Should fix* · Broadcast, report and update editors

Wrong: the status line, Save and Send sit in the page and leave the screen on a long draft. The only save is the bar.

Fix: make the composer bar sticky at the top of the scroll area (52 high, the same hairline and bleed as the page header bar, `z-10`). This reuses the existing `.shell-header` sticky rule.

**21. No sign of unsaved changes** · *Nice to have* · Broadcast editor

Wrong: subject and body save only with the Save button; there is no indicator. (The audience auto-saves.)

Fix: the status line shows "Unsaved changes" (12/18, amber) next to "Draft" once the subject or body differs from what was loaded. No behaviour change.

### Broadcast (sent)

**22. A disabled Send on a sent broadcast** · *Must fix*

Wrong: the primary Send button is still drawn, pale and disabled, beside Duplicate as draft. It does nothing and cannot do anything. The same leftover exists in the old look.

Fix: when the broadcast is sent, the bar shows one action: Duplicate as draft (secondary). No Send, no disabled placeholder.

**23. A long subject is cut off** · *Must fix*

Wrong: the title is a single-line input, so a long subject is clipped at the column edge ("… how you're using A"), and in the sent state it is disabled at 80% opacity, so it also looks greyed out.

Fix: the title becomes an auto-growing textarea (rows 1, grows to fit, no resize handle) at the record title size. When sent, it is plain heading text at full opacity, not a disabled input.

**24. Nothing says who it went to** · *Should fix* **[BEHAVIOUR]**

Wrong: a sent broadcast shows the body and, much further down, the Delivery table. The page does not say how many companies or contacts it reached. The data is in the page already (`targets`, `recipients`).

Fix: under the title, one line, 12/18 muted: "Sent Oct 21 by <name> to 38 contacts at 54 companies · 36 delivered · 2 failed". "2 failed" links to the Delivery table and shows Retry unsent beside it. This adds information.

**25. Delivery is buried under a long body** · *Nice to have* **[BEHAVIOUR]**

Wrong: a long email pushes the Delivery table out of sight.

Fix: two tabs under the title line, "Message" and "Delivery", with Delivery showing the count. Default to Message. Changes the layout of the page.

### Fund Reports (list)

No findings beyond the shared ones.

### Report editor

**26. "Unpublish to edit" is the primary button** · *Should fix*

Wrong: on a published report the one filled button is the action that pulls the report back to draft.

Fix: on a published report there is no primary. "Unpublish to edit" is a secondary button; Preview stays beside it.

**27. Old-style form bits in the Publish confirmation** · *Should fix*

Wrong: the notify checkbox uses `border-ochre/50`, the note textarea uses `bg-white/60`, and the confirm panel is the old amber bordered style. They are the last old-look controls on the page.

Fix: use `Notice` (#5) for the panel, and the standard checkbox and textarea controls (ctl border, surface fill). Notify checkbox and note label at 14px.

**28. The help paragraph is always there** · *Nice to have*

Wrong: "Type @ to mention a portfolio company … Use the chart icon …" is 12px grey text above the editor on every open.

Fix: show it once as an empty-editor placeholder line (14px muted, inside the editor, gone as soon as you type).

### Report preview

**29. The preview is not a page** · *Must fix*

Wrong: there is no header bar, no title, no way back to the editor (only the sidebar or the browser back button), and the report sits in a 1104-wide cream block with a border and rounded corners, inside which sits an amber mono "PREVIEW — DRAFT, NUMBERS NOT FROZEN" strip. In dark mode this is a bright cream slab on a dark page. The old look rendered the report in place with a normal page around it.

Fix:
- Standard 52px sticky header bar (the Form header, #8): a "‹ Edit report" back link, title "Preview", description "How LPs will see this. Numbers are not frozen until you publish." Right side: secondary "Edit report". Publish stays in the editor. The amber banner inside the frame is removed in this admin preview (the text lives in the bar).
- The frame is full bleed under the bar: width 100%, height `calc(100dvh - 52px)`, no border, no radius, no margin. The LP cream becomes the page behind the report, with no block edge to look hard. A single scroll (the frame's own).
- In dark mode, the frame stays in the LP's light look (that is the point of a preview); the bar carries a 12/18 muted "Shown in the LP's light look".
- Phone: same, with the bar's back link as an icon.

### Funds (list), LPs (list)

No findings beyond the shared ones.

### Fund detail

**30. The deals table is clipped** · *Must fix*

Wrong: at 1920 the Deals table is cut off at the right edge of the 960 column, with a half-visible "S" column header, while the 296 side panel sits beside it with nothing to do. The same column limits the LPs, Reports and Cashflows tabs.

Fix: the page grid's first row holds the Performance strip (main column) and the side panel. The tabs and their tables are the second row and span the whole frame (`grid-column: 1 / -1`, 1296 wide). The panel is not sticky past the first row.

**31. Performance box is bordered and filled, with mono figures** · *Should fix*

Wrong: the box is a rounded, bordered, grey-filled card; the side panel is fill-only. Two box styles in one view, and the figures are mono.

Fix: the `Stat` strip (#13), no box, in the main column; "As of Oct 20, 2026" as a 12/18 caption on the right of the strip's heading; the "Admin-only estimate" note at 12/18 under it. The side panel stays as is.

### Deal Ledger (list)

No page-specific findings. The stat labels are #12 and #13; the select styles are #10.

### Deal Ledger detail (a company across funds)

**32. A warning dot with no label** · *Should fix*

Wrong: the "Positions by fund" row ends in "n/a  $0 implied ●", an amber dot with no tooltip and no text, and "n/a" with no explanation.

Fix: replace the dot with a text status at the end of the row: "No valuation yet" (12/18, amber tone) when there is no mark, nothing otherwise. "n/a" becomes "—".

**33. The most useful sections are last, and the forms are boxed** · *Nice to have* **[BEHAVIOUR]**

Wrong: the page opens with the Contacts section and three empty input boxes, then the money. "Valuation history" ends in a grey, bordered card with three more inputs. Six sections have the same weight.

Fix (layout only unless you pick the second line): order = Positions by fund, Deals across funds, Financing rounds, Valuation history, Contacts. The "Add valuation mark" form loses its card: it is a row of 36-high inputs on the page background under a hairline. If you also want the three empty Contacts inputs hidden until "Add contact" is clicked, that is a change to what the page does.

### Memos (list and board)

**34. View switch floats below the tabs** · *Should fix*

Wrong: Board / List sits 20px lower than the Mine / Team / Everything tabs and on its own line at the right.

Fix: same row as the tabs, right-aligned, same height as the tab row (40), the toggle at 28 high. The filter bar (#10) follows 24px under. "6 memos · 1 in review" moves to the right end of the filter bar as 12/18 meta.

### Memo (detail)

No findings. The Dossier page is consistent with the pattern.

### Memo (new) and Memo template

**35. The template is a wall of boxes** · *Nice to have* · Memo template

Wrong: each section is a filled name input, a filled textarea with a resize handle, two checkboxes and three icon buttons, repeated nine times.

Fix: the section name is plain text until hover or focus (no fill, no border); the description auto-grows with no resize handle; Required and "Include in share links" stay as checkboxes in a row; the up, down and delete buttons show on hover or focus only (always on phone). Hairline between sections; 24 above and below each.

The page top for New memo and Memo template is #8.

### Team Board

**36. Banner and filter row are old-look** · *Should fix*

Wrong: the "1 item needs review" banner has the full amber outline (#5). The filter row is a labelled form (Project, Owner, Search) unlike every other page (#10).

Fix: `Notice` for the banner (action "Show them" stays). The filter row uses `filter-bar.tsx` with Project and Owner as outlined selects and the search field, in one 44px bar.

### Investor Links

**37. Copy link, view count and Revoke are two clicks away** · *Should fix* **[BEHAVIOUR]**

Wrong: the old look showed "N views", Copy Link and a trash button on every link. In the new look the row shows only data; all three live in the pane. Copying a link, the commonest action, takes opening the pane first.

Fix: on row hover or keyboard focus, show a ghost "Copy link" button in the row's action slot (the same slot Providers uses), and bind `c` to it on the focused row. The pane keeps Copy, Views and Revoke. Revoke stays in the pane only (it is destructive). This adds a row action the new look did not have.

**38. The create form still uses the old picker** · *Should fix*

Wrong: "Updates to include" uses a rounded bordered box with uppercase grey company bands and `bg-primary/5` on selection; "Bulk select by period" is a dashed-border box. The form is narrowed to 720 and its border removed, but its contents are the old controls.

Fix: `PickerList` (#1) with company group rows. The bulk selection becomes a plain row (From, To, Select all in range, Clear) under a hairline, no dashed box. Expiry options become the segmented control (#11).

### Diligence

**39. The count appears twice** · *Nice to have*

Wrong: the group header says "Awaiting founder 1 company" and the footer says "1 company".

Fix: when a table is grouped, the footer shows the total only if it differs from a single group's count; or drop the footer count when groups carry their own.

The pane carries over everything the old card showed (founder, incorporation answer, essay status, document counts, Open company, Promote, Decline). No other findings.

### Service Providers

**40. Two tables that do not line up** · *Should fix* **[BEHAVIOUR]**

Wrong: "Pending review" and "All providers" are two DataTables with different column widths (Category starts at 570 in one and 669 in the other), and different widths for the Endorsements header. "All providers" lists only vetted and rejected ones, so the name is wrong. Each pending row has a filled Approve plus an outlined Reject plus an edit and a delete icon, always visible; the second table has the icons only.

Fix: one table with a fixed "Pending review" group above the rest (DataTable `groupBy`, as Diligence does), so columns align by construction; the second group is labelled "Directory". Approve (filled) and Reject (outlined) show on pending rows only; edit and delete become hover actions (always on phone). Status glyph is #3. Renaming "All providers" to "Directory" is a copy change for Nosa. Merging the tables changes how the page is organised.

### Audit Log

**41. Raw codes and ids** · *Should fix* **[BEHAVIOUR]**

Wrong: the Action column mixes readable labels ("Sign-in succeeded") with raw codes (`COMPANY_IMPORT_COMPLETED_WITH_WARNINGS…`, `MEMO_STAGE_CHANGED`); the Target column shows `Company · cmwns32ig000fbo0trxbyq4l4`, an id that means nothing. In a log you read, not grep.

Fix: Action shows a readable label from a map ("Memo stage changed"), with the raw code as a tooltip and in the Details row. Target shows the record's name when there is one ("Company A"), with the id in the tooltip. Unknown codes fall back to the code in sentence case. This changes the text shown, not the data.

### Portfolio Contacts

**42. A stack of unrelated lines above the table** · *Should fix* **[BEHAVIOUR]**

Wrong: between the tabs and the table sit three things at three gaps: "CSV format ⌄" (a collapsed note), a sentence "2 of 9 portfolio companies have at least one contact.", then the filter bar. The sentence floats and is 12px grey; the note is a rarely needed instruction taking a line of every visit.

Fix: tabs → filter bar (with "2 of 9 have contacts" as the right-hand 12/18 meta, as the Audit Log does with "115 events") → table. The CSV format note moves behind a "CSV format" ghost link beside Import contacts in the header, opening a popover. The Links tab was not in the screenshots; check it against the same rule.

### Settings

**43. The status list takes the first screen** · *Should fix* **[BEHAVIOUR]**

Wrong: five diagnostic rows (about 220px) come before the tabs, and on a healthy install all five say "Configured" in green.

Fix: when everything is healthy, one line: "All 5 services are working" (14px, green dot), expandable. When any is not, the strip shows only the ones that need attention. The status of each service is unchanged; what is shown when all is well changes.

**44. Text is too small and the layout wastes the page** · *Should fix*

Wrong: descriptions and paragraphs are `text-xs` (12px) all through the three tabs (Granola, Slack, Marge, reminders). The density doc says 12 is for metadata only. At 1920 the 720 column floats with about 490px empty on each side, so the page title is 700px from the sidebar.

Fix: paragraphs 14/22, descriptions under section titles 12/18 (as now), env variable names stay mono (they are code). Spacing between sections 48. For the layout, Nice to have: use the 1056 detail frame with the tabs as a left rail (Email and digest, Storage, Integrations, 160 wide) and the 720 content beside it. The content, the tabs and their order are unchanged. This is a decision for you.

### Add company (form)

No findings beyond #8 (page top) and #11 (selected segment). "Manage sectors" under the Sector select is an orphan link; move it to the select's own menu footer, or to Settings (Nice to have, not numbered).

### Weekly Digest (list)

No findings beyond the shared ones.

### Weekly Digest (new)

**45. Mono textarea and old top** · *Should fix*

Wrong: the textarea is mono for both the placeholder links and the pasted notes; the page top is #8.

Fix: sans 14, 8 lines min. The "Generate Digest" button stays disabled until there is text, with the same reason line as #19: "Paste at least one link or some notes."

### Weekly Digest (detail)

**46. The action row wraps onto two lines** · *Must fix*

Wrong: at 1920 and on a phone, the title takes the left of the 720 column, so "Draft", Edit and Delete fill one row and "Send to team" drops to a second. Draft shows two glyphs (#3). Section headings ("This Week's Todos") are 12px semibold above 14px prose: the heading is smaller than what it heads.

Fix: Record header (#8): back link, title, a status line under the title ("Draft · Week of Nov 16, 2026"), and actions top right: primary "Send to team" and a ⋯ menu holding Edit and Delete. Section headings 14/20 medium.

### Pages with no findings

Needs you aside from #15, Companies list, Company detail, Update detail, Memo detail, Deal Ledger list, Funds, LPs, Reports and Broadcasts lists, Updates list: no page-specific findings; the shared ones above apply.

---

## Coverage and limits

- **Looked at in screenshots (new look, 1920):** Needs you, Approvals, Diligence, Companies detail, Updates, Investor Links, Memos (board), Memo detail, Memo new, Memo template, Team Board, Deal Ledger list and detail, Funds list, Fund detail, LPs, Fund Reports list, Broadcasts list, Audit Log, Portfolio Contacts, Service Providers, Settings (Email and Integrations tabs), Report preview, Digest list, new and detail, Add company, Update detail. Phone: Providers, Digest detail, Report preview. Dark: Providers, Team Board, Report preview.
- **From code and live screenshots only:** broadcast editor (draft and sent), report editor, new-update composer, Investor Links create form, Diligence and Link panes. The editor toolbar was seen once, in a live screenshot, and has no findings.
- **Not seen:** Portfolio Contacts "Links" tab, Settings "Storage" tab, Companies list at 1920, Memos List view, the update composers. Each should be shot once after the fixes.
- **Phone:** only a few pages were looked at; the shared fixes need one phone pass on every page they touch.
