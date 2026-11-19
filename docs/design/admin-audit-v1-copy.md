# Admin audit fixes, words review v1

Status: **recommendations for the engineer. Nothing here is built.** Author: Nosa. Board card B-195. Source: the engineer's list of new and changed strings after `docs/design/admin-audit-v1.md`, each checked against the code. House rules: `docs/design/redesign-v1-copy.md` (brand is "DFS", sentence case, plain and short, no em dashes in UI text, the same action gets the same words everywhere). All names below are placeholders.

Most of these strings live in files that render both looks (the new look is `v2:` classes on the same markup). So "Shared with old look or founder/LP?" is **yes** for almost every row. A recase there changes the old look too. That is safe and keeps the two looks consistent, but the engineer should know it, and Joseph may prefer to limit it. Where the same text also sits on a founder or LP page, the Why column names that page.

## Decisions on the lead's questions

1. **Title case vs sentence case.** Sentence case everywhere in the new look, per the house rule. Page names stay as they are (they are proper names: "Team Board", "Deal Ledger", "Fund Reports", "Service Providers"). Buttons, labels, modal titles and menu items are recased (rows 7 to 22). For add-vs-create, keep both: "Add company" opens the form and "Create company" commits it, the same pair as "New memo" and "Create memo".
2. **Approvals "Pending approval" vs the page name.** Rename the group to "Awaiting approval". It matches "Awaiting password setup" beside it, and no longer repeats the word "Pending" from the nav.
3. **"Dismissed / stale".** Rename to "Dismissed or expired". "Stale" is jargon, and the rows already say "expired <date>". Make the status cell "Link expired" too.
4. **Broadcast summary wrapping.** Remove the separate dot spans. Use commas that sit inside the text. See row 1.
5. **Audit Log.** The generated labels are mostly fine. 20 read badly or say something other than the screen does. Overrides are in the second table.

## Changes that alter meaning (check with Joseph)

- **Row 30, Settings "All N services are working".** It counts services that are "Not configured" as working, and "Configured" only means a key exists, not that it works. Proposed: "Nothing needs attention".
- **Row 3, the Send tooltip.** It says "Add a message" but Send also needs a subject. Proposed wording names the subject. It does not change what Send does.
- **Audit labels BROADCAST_PUBLISHED (shown as "Sent"), MEMO_DECISION_CHANGED (shown as "stage"), MARK_* (shown as "valuation")** change the label to the word the screen uses. See the second table.
- **COMPANY_DILIGENCE_PROMOTED** (row A18): I guessed what "promoted" does. Check it before shipping the override.

Everything else is wording only.

## Words table

| # | Page | Current | Proposed | Why | File | Shared with old look or founder/LP? |
|---|---|---|---|---|---|---|
| 1 | Broadcast, sent summary | `Sent 12 Nov by Sam Admin to 14 contacts at 3 companies · 12 delivered` then a separate `·` then `2 failed`, then `Retry unsent` | Two lines. Line 1: `Sent 12 Nov by Sam Admin`. Line 2: `14 contacts at 3 companies: 12 delivered, 2 failed` (the "2 failed" stays a button). `Retry unsent` goes on its own line below on a phone. Mark each count `whitespace-nowrap`. | The orphan dot comes from a `<span>·</span>` that is its own flex item. Punctuation glued to the previous word can never start a line. Two short lines also read faster than one long one. | `src/app/admin/broadcasts/[id]/page.tsx:490-509` | No (new look only, `newLook && !isDraft`) |
| 2 | Broadcast, sent summary | `N delivered` / `N failed` | `N delivered` and `N failed`. Singular is fine, the nouns do not change. | Checked: no wording change. Listed so the engineer keeps "delivered" and "failed" (they match the Delivery tab statuses). | same | No |
| 3 | Broadcast, Send tooltip and line under the subject | `Add a message and pick at least one company to send.` | `Add a subject, a message and at least one company to send.` | **Meaning (accuracy).** `canSend` needs a subject, a body and a company (`page.tsx:389`). The current line hides the subject, so a person with a body and a company is told nothing. | `src/app/admin/broadcasts/[id]/page.tsx:124` | No |
| 4 | Report preview | `Shown in the LP's light look` | `Shown in light mode, as LPs see it` | "Look" is our internal word for the new/old switch ("Try the new look"). LPs do not have a "look". "Light mode" matches "Switch to dark mode". | `src/app/admin/reports/[id]/preview/page.tsx:31` | No |
| 5 | Update composer | `Save as Draft` | `Save as draft` | Sentence case. | `src/app/admin/companies/[id]/updates/new/page.tsx:162` | Yes. Same text in the founder composer `src/app/updates/new/page.tsx:220`; change both or neither. |
| 6 | Update composer | `Send Update` | `Send update` | Sentence case. | `src/app/admin/companies/[id]/updates/new/page.tsx:165` | No (admin page). Founder composer has `Publish`. |
| 7 | Update edit | `Save Changes` | `Save changes` | Sentence case. Same label in four places, so fix them together. | `src/app/updates/[id]/page.tsx:720`, `src/components/admin/company/profile-card.tsx:204`, `src/app/admin/lps/page.tsx:451`, `src/app/admin/providers/page.tsx:551` | Yes. `/updates/[id]` is shared with founder and LP views. |
| 8 | Add Company | `Add Company` (page title, list button x2) | `Add company` | Sentence case. Page name "Companies" stays. | `src/app/admin/companies/new/page.tsx:118`, `src/app/admin/companies/page.tsx:444,536` | Yes (old look, same markup). |
| 9 | Add Company | `Company Name` | `Company name` | Sentence case. | `src/app/admin/companies/new/page.tsx:148` | Yes. Same text on founder `src/app/company/profile/page.tsx:429`, `src/app/setup-wizard/page.tsx:286`, and `profile-card.tsx:102`. Recase all or none. |
| 10 | Add Company | `Funding Stage` | `Funding stage` | Sentence case. | `src/app/admin/companies/new/page.tsx:189` | Yes. Also founder `src/app/company/profile/page.tsx:469`, `profile-card.tsx:160`. |
| 11 | Add Company, card title | `Assign User (Optional)` | `Assign a user (optional)` | Sentence case. | `src/app/admin/companies/new/page.tsx:205` | Yes (old look). |
| 12 | Add Company | `User Assignment` (a label directly under the card titled `Assign User (Optional)`) | Delete the label. If the engineer wants one for the buttons' accessible name, use `aria-label="Assign a user"` on the button group. | The card title and the label say the same thing one line apart. | `src/app/admin/companies/new/page.tsx:210` | Yes (old look). |
| 13 | Add Company, segment buttons | `Existing User`, `Create New User`, and field `User Email` | `Existing user`, `New user`, `User email` | Sentence case. "Create New User" is the only button that starts with a verb. The other two are choices, so all three should be nouns. | `src/app/admin/companies/new/page.tsx:231,241,249` | Yes (old look). |
| 14 | Investor Links | `New Link` (header button and empty-state action) | `New link` | Sentence case. | `src/app/admin/links/page.tsx:409,597` | Yes. Same text on `src/app/links/page.tsx:204,305` (a different, non-admin page); recase with it. |
| 15 | Investor Links | `Link Expiry` | `Link expiry` | Sentence case. | `src/app/admin/links/page.tsx:549` | Yes. Also `src/app/links/page.tsx:268`. |
| 16 | Investor Links | `Bulk select by period (LP report link)` | `Select by period (LP report link)` | "Bulk" is jargon and adds nothing. The parenthesis stays because I cannot tell from the code what it is for; if Joseph can say, shorten it. | `src/app/admin/links/page.tsx:437` | Yes (old look). |
| 17 | Investor Links | Two counts: `N updates across N companies.` (with a stray full stop, inside the form) and `N updates selected` (bottom) | Keep both. Drop the full stop on the first so it matches the second. | The two lines say the same thing in different places. Matching punctuation is enough. | `src/app/admin/links/page.tsx:470,544` | Yes |
| 18 | Service Providers | `Add Category` (menu item, modal title, submit button) | `Add category` | Sentence case. Three places. | `src/app/admin/providers/page.tsx:311,319,458,473` | Yes (old look) |
| 19 | Service Providers | `Add Provider` (button, modal title, submit) | `Add provider` | Sentence case. | `src/app/admin/providers/page.tsx:324,481,551` | Yes |
| 20 | Service Providers, edit modal | `Edit — <name>` | `Edit <name>` | House rule: no em dashes in UI text. | `src/app/admin/providers/page.tsx:481` | Yes |
| 21 | Fund page and Deal Ledger stats | `Implied Value` | `Implied value` | Deal Ledger already says "Implied value" (`portfolio/page.tsx:245`) and the footnote under the fund card says "Implied value". Same figure, same words. | `src/components/fund-performance-card.tsx:95` | Yes. `fund-snapshot-block.tsx` also uses this card, so it may show on the LP side. Check before changing. |
| 22 | Fund page | `<Fund> — Performance` | `<Fund> performance` | No em dashes in UI text. | `src/components/fund-performance-card.tsx:89` | Yes (same as row 21). |
| 23 | Approvals | `Pending approval N` | `Awaiting approval N` | See decision 2. Parallel with "Awaiting password setup". | `src/app/admin/approvals/page.tsx:846` (heading), `:891` (aria `Pending approvals` to `Awaiting approval`) | Yes (old look, same file) |
| 24 | Approvals | `Dismissed / stale N` | `Dismissed or expired N` | See decision 3. "Stale" is jargon. A slash between two words forces the reader to guess whether it means "and" or "or". | `src/app/admin/approvals/page.tsx:1375`, aria `:1379` (`Dismissed or stale accounts` to `Dismissed or expired accounts`) | Yes |
| 25 | Approvals, status cell | `Link stale` | `Link expired` | Matches "expired <date>" in the next column. | `src/app/admin/approvals/page.tsx:1277` | Yes |
| 26 | Approvals, link column | `expired <date>` | Keep. Capitalise only if the engineer's column style capitalises the other cell text. | Fine as is. Row listed only so nobody changes it by accident. | `src/app/admin/approvals/page.tsx:1257` | Yes |
| 27 | Team Board, banner | `N item(s) needs/need review: names or projects Molly couldn't match` | `Molly couldn't match a name or project on N items` (singular: `on 1 item`) | A colon fragment. The Needs you action card already says this sentence ("Molly couldn't match a name or project on {n} items", words list section 6). One sentence, one place. Wording only. | `src/app/admin/board/board-client.tsx:599` | Yes (old look) |
| 28 | Team Board, filtered banner | `Showing N items that need review` / button `Show all` | `Showing the N items Molly couldn't match` / button `Show all items` | "Show all" does not say what "all" is. | `src/app/admin/board/board-client.tsx:598,607` | Yes |
| 29 | Portfolio Contacts, header | `Import contacts (CSV)` | `Import CSV` (same as Companies) | The same action on two pages has two names. On both pages the page title already says what is being imported. | `src/app/admin/portfolio-contacts/page.tsx:318` | Yes. Companies page `src/app/admin/companies/page.tsx` already says `Import CSV`. |
| 30 | Settings, status | `All N services are working` | `Nothing needs attention` | **Meaning.** The strip only checks that a setting exists (`resendOn`, `cronOn`, `granola.on`). "Not configured" integrations are counted as "working". A claim we cannot prove. | `src/app/admin/settings/settings-status-strip.tsx:84` | No (new look only, `v2:block`) |
| 31 | Settings, status | `N other service is working` / `N other services are working` | `N other services have no problems` (singular: `1 other service has no problems`) | Same reason as row 30. "Working" is a claim; "no problems" is what the code knows. | `src/app/admin/settings/settings-status-strip.tsx:85` | No |
| 32 | Settings, status | `Not set` (required items) and `Not configured` (optional items) | `Not set up` for both. Keep the amber for required, grey for optional. | Three words for one idea (Configured, Not set, Not configured). Tone already marks the difference. `Not set` is also an existing memo-owner option elsewhere, so it is not a settings-only term. | `src/app/admin/settings/settings-status-strip.tsx:24,25,38,47`; `src/app/admin/settings/page.tsx:25` | Partly. `page.tsx:25` is the old look. Not in the founder or LP pages. |
| 33 | Settings, status | `N failure(s) in 7 days` / `No failures in 7 days` | `N failure(s) in the last 7 days` / `No failures in the last 7 days` | "In 7 days" reads as the future. | `src/app/admin/settings/settings-status-strip.tsx:30,31` | Partly (the old strip uses the same rows) |
| 34 | Deal Ledger detail, contacts form | `Email *` beside `Role (optional)` | `Email` | Two conventions on one form: a star for required and "(optional)" for optional. Use "(optional)" only. A blank required field still shows its error. | `src/app/admin/portfolio/[id]/page.tsx:596` | Yes (old look) |
| 35 | Retry toast, broadcast | `Retried N — N sent, N still failed.` | `Retried N: N sent, N still failed.` | No em dashes. | `src/app/admin/broadcasts/[id]/page.tsx:360` | Yes |

### Checked and fine (left out of the table)

Broadcast header, tabs, audience and recipients wording; "Draft in <fund>", "Published in <fund>", "Unpublish to edit", "Fund Reports"; "Report", "Preview", "Edit report"; digest strings including "Send to team", "Resend" and "Delete this draft?"; "New memo" and its description; memo template text; "Add contact"; Deal Ledger section headings; "No valuation yet."; stat labels "Invested", "TVPI", "DPI", "Gross IRR", "Total invested", "Deals", "Companies", "Funds", "As of <date>"; Settings tab names; Providers "Pending review", "Directory", "Filter providers" and the status chips; Approvals "Filter by name or email", "More actions for <name>", "Dismiss", "Delete"; Investor Links "Copy link" and "Copied"; "CSV format"; Team Board filter words ("Search titles…", "All projects", "No project", "All owners", "Me", "Unassigned").

Small notes for the engineer, not changes: the digest "Edit (Nh left)" is clear enough in context. "Contacts" count line `N of N have contacts` should read `N of N companies have contacts` (`portfolio-contacts/page.tsx:417`), a clarity fix, shared with the old look.

## Audit Log action labels

Code: `actionLabel()` in `src/app/admin/audit/audit-table.tsx:64`. It lower-cases the code, swaps `portco` for `portfolio company`, swaps underscores for spaces, and capitalises the first letter. Only `SIGN_IN_SUCCEEDED` and `SIGN_IN_FAILED` have explicit labels. Codes are written by `logAdminAction()` (`src/lib/audit.ts`), about 115 distinct codes.

Note: there is no `MEMO_STAGE_CHANGED` in the code. The stage change is logged as `MEMO_DECISION_CHANGED` (the field was renamed Stage on screen), so the override matters (row A1). `MEMO_STATUS_CHANGED` is the Draft / In review / Final status and needs no override.

**Generic fix first (one rule, fixes many):** after lower-casing, restore acronyms word by word: `lp` to `LP`. Without it every LP event reads "Lp created", "Lp fund assigned", "Lp email added", "Lp deleted" (8 codes: `LP_CREATED`, `LP_UPDATED`, `LP_DELETED`, `LP_FUND_ASSIGNED`, `LP_FUND_UNASSIGNED`, `LP_EMAIL_ADDED`, `LP_EMAIL_REMOVED`, `LP_EMAIL_PRIMARY_CHANGED`). Apply the same to `csv`, `id`, `url` if they ever appear.

**Explicit overrides** (code to label):

| # | Code | Generated now | Proposed label | Why |
|---|---|---|---|---|
| A1 | `MEMO_DECISION_CHANGED` | Memo decision changed | Memo stage changed | The memo screens call the decision field "Stage" (Evaluating, Later, Passed…). Lead's correction: `MEMO_STATUS_CHANGED` is the memo status (Draft, In review, Final), so it keeps its generated label "Memo status changed". |
| A2 | `BROADCAST_PUBLISHED` | Broadcast published | Broadcast sent | The screen says Send and "Sent". "Published" is the code's word. |
| A3 | `BROADCAST_RETRIED` | Broadcast retried | Broadcast retried for unsent contacts | The button is "Retry unsent"; this ties the two. |
| A4 | `BOARD_CARD_CREATED` | Board card created | Board item created | The board calls things "items" (words list, section 0). |
| A5 | `BOARD_CARD_MOVED` | Board card moved | Board item moved | Same. |
| A6 | `BOARD_CARD_UPDATED` | Board card updated | Board item updated | Same. |
| A7 | `BOARD_CARD_LINK_ADDED` / `_REMOVED` | Board card link added | Board item proof link added / removed | The pane heading is "Proof links". |
| A8 | `SETUP_QUEUE_DISMISSED` | Setup queue dismissed | Account dismissed from awaiting setup | "Setup queue" is not a name anyone sees in the UI. Approvals calls it "Awaiting password setup". |
| A9 | `SETUP_QUEUE_UNDISMISSED` | Setup queue undismissed | Account restored to awaiting setup | "Undismissed" is not a word. |
| A10 | `SETUP_QUEUE_USER_DELETED` | Setup queue user deleted | Account deleted (awaiting setup) | Same. |
| A11 | `MARK_CREATED` / `MARK_DELETED` | Mark created / Mark deleted | Valuation added / Valuation deleted | The screen section is "Valuation history". "Mark" means nothing to most readers. |
| A12 | `ROUND_CREATED` / `_UPDATED` / `_DELETED` | Round created | Financing round created / updated / deleted | The screen section is "Financing rounds". "Round" alone could mean a memo round. |
| A13 | `MARGE_READ` | Marge read | Marge read data | A verb with no object reads as a typo. |
| A14 | `MARGE_DENIED` | Marge denied | Marge request denied | Same. |
| A15 | `DOCUMENT_ORPHAN_DELETED` | Document orphan deleted | Orphaned document deleted | Word order. |
| A16 | `PORTCO_CONTACT_ADDED` / `_UPDATED` / `_REMOVED`, `PORTCO_CONTACTS_IMPORTED` | Portfolio company contact added, Portfolio company contacts imported | Contact added / updated / removed, Contacts imported | Too long for a one-line row. The Target column already says "Portfolio company" (row shows `<Type> · <name>`). |
| A17 | `MEMBER_ADDED` | Member added | Company member added | "Member" of what? (It is a company membership.) |
| A18 | `COMPANY_DILIGENCE_PROMOTED` | Company diligence promoted | Company moved out of diligence | Lead checked: the promote route sets the company from DILIGENCE to ACTIVE and closes its diligence, so "moved out of diligence" is right. "Company moved into portfolio" would also be accurate. |
| A19 | `PORTCO_LINKED` / `PORTCO_UNLINKED` | Portfolio company linked / unlinked | Company linked to ledger / unlinked from ledger | The comment in `companies/[id]/route.ts` says a deleted company unlinks its ledger row. "Portfolio company linked" does not say to what. Lower confidence; leave as generated if unsure. |
| A20 | `DEALS_LINKED_TO_SHEET` | Deals linked to sheet | Deals linked to Google Sheet | Only if the sheet is a Google Sheet; check. Lowest priority. |

Everything else generates acceptably, for example "Fund updated", "Memo created", "Report published", "Digest sent", "User approved", "Test email sent", "Sign-in failed". Sentence-case "Granola intake processed" and "Slack test posted" are proper nouns at the start, so they are fine.

**Shared with old look?** The old look keeps showing raw codes (see `ACTION_LABELS` in `src/app/admin/audit/page.tsx:34`), so overrides added in `audit-table.tsx` are new look only. The target text `<Type> · <name>` is also new look only.

## Counts

- Words table: 35 rows (rows 2 and 26 are "keep as is" notes, so 33 proposed changes).
- Audit overrides: 20 rows covering about 30 codes, plus one generic acronym rule for LP.
- Meaning changes to check with Joseph: rows 3 and 30/31, and audit overrides A1, A2, A11 and A18 (the last is a guess).

## For Alvin

- Row 1 is the only structural change. Everything else is a string edit.
- Several files serve both looks and founder pages. Recasing is safe, but rows 5, 7, 9, 10, 14, 15 and 21 each have a twin elsewhere. Change the twin in the same commit, or say why not.
- No test strings were checked. Run `grep` for these labels in `__tests__` and e2e files before changing them (not done here).
- Nothing in this file needs analytics or SEO work: all of it sits behind sign-in.
