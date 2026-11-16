# Molly redesign, words list v1

Status: **draft for Joseph.** Author: Nosa. Board card B-125 (WS155 in `docs/PLAN-1.md`). Source: Nisat's labels in `redesign-v1.md` section 5 and the outlined words in `redesign-v1.html` ("Show new labels"). Nothing here is built. The board tile markers are being redone by Nisat, so section 7 is provisional.

Voice, as Molly already speaks it: plain, short, sentence case, no jargon, "you" for the team member. Toasts end with a full stop. Buttons are a verb, or a verb and a noun. The brand is "DFS", never "DFS Lab". All names, companies and figures below are placeholders (Acme Ltd, Example Co, Sam Founder).

**How to read the tables.** "Final" is the ship text. "Was" appears only where I changed Nisat's draft, with a one-line reason. `{curly}` marks data filled in by the app.

## 0. Words the new labels must match (found in `src`)

| Existing wording | Where | Rule for the new labels |
|---|---|---|
| "Nothing needs you right now." | `src/app/admin/page.tsx:250` | Keep verbatim. It is already the dashboard empty state. |
| "Behind on updates" | dashboard KPI, `page.tsx:227` | Use for the group and for "overdue" everywhere. Never say "overdue" to a person. |
| "Reminder sent to {name}." / "Alert dismissed." / "Dismissed {name}." | toasts in `admin/page.tsx:129,188`, `approvals/page.tsx:269` | Toasts are past tense, end with a full stop. |
| "Couldn't send the reminder." / "Couldn't dismiss the alert." | same | Error toasts say "Couldn't …". Not changed by the redesign. |
| "No update sent yet" / "Last update {n} days ago" | `lib/attention.ts:100` | Row detail text. |
| "No founder in Molly" / "No founder yet" | `admin/page.tsx:288`, `companies/page.tsx:192,315` | Use as is. When this shows, there is no reminder button. |
| "Clear filters" | `ui/data-table.tsx:616`, `memos-empty.tsx:16` | Filter reset is "Clear filters", not "Clear all". |
| "To do", "In progress", "Blocked", "Done" | `lib/board.ts:8-11` | These are the only four board statuses. |
| "Add item", "board item" | `board-client.tsx:388`, `attention.ts:67` | The board calls its things "items" on screen. |
| "proof links" | board card sheet | Pane heading "Proof links" matches. |
| "From DFS" | `layout/sidebar.tsx:48` | Founder section heading, verbatim. |
| "Recent updates" | `dashboard/page.tsx:311` | Verbatim. |
| "Search and jump to anything" | `lib/shortcuts.ts:81` | Palette placeholder is a sibling of this; see 1. |
| "Back to {place}" | `Back to Companies`, `Back to Updates` | Back links name the place. See 5. |
| "No updates yet", "No notes yet", "No history yet." | various | Empty lines are "No {things} yet". |

## 1. Shell

| Label | Final | Where | Note |
|---|---|---|---|
| Home item | Needs you | First sidebar item, header title, palette "Go to", `g d` | Replaces "Dashboard". Matches "Nothing needs you right now." |
| Jump box | Search or jump to… | Sidebar button; palette input placeholder and dialog label | Keep. The ellipsis is on the placeholder only; the sidebar button reads "Search or jump to". |
| Switch in | Try the new look | Admin-only switch, in the account menu in the old look | Not in the mockup, so new here. |
| Switch out | Use the old look | Sidebar footer; palette action | Pair of "Try the new look". |
| Toast on switching | Back to the old look. | After "Use the old look" | Added a full stop. |
| Theme toggle (screen reader and palette) | Switch to dark mode / Switch to light mode | Sidebar footer icon, palette Actions | Was "Switch to dark / light". Reason: "mode" makes it a complete phrase in a list. |
| Palette headings | Actions, Go to | Palette | Unchanged. |
| Mobile menu | Open menu | Phone header button (screen reader) | Unchanged. |

## 2. Needs you

| Label | Final | Where | Note |
|---|---|---|---|
| Group: queues | Waiting on you | Group header | Unchanged. Echoes the diligence page's own empty line. |
| Group: board | On the board | Group header | Unchanged. |
| Group: alerts | Alerts | Group header | Unchanged. |
| Group: late | Behind on updates | Group header | Unchanged (matches KPI). |
| Row kind (right column) | Approvals, Diligence, Team Board, Metric alert, Behind | Row, right | Was "Overdue". Reason: users never see "overdue" today. |
| Row text | Unchanged from `buildAttention` ("3 signups are waiting for approval", etc.) | Row | Do not reword; the app already makes these. |
| Portfolio heading | Portfolio | Section under the inbox | Unchanged. |
| KPI labels | Companies, Updates this month, Cash across portfolio, Up to date | KPI strip | Was "On track". Reason: "Up to date" is the group name on Companies, so one word for one idea. |

**Empty state (Needs you).** Two sentences:

> **Nothing needs you right now.**
> When someone signs up or an update runs late, it shows here.

Unchanged from Nisat. Where: the Needs you screen when no rows exist.

## 3. Filters

| Label | Final | Where |
|---|---|---|
| Chip names | Kind, Company, Owner, Stage, Status, Due | Filter bar. Unchanged. |
| Unset chip | + {Name} (the plus is decorative) | Filter bar |
| Set chip | {Name}: {value}, with a remove button labelled "Remove {name} filter" | Filter bar. Unchanged. |
| Reset | Clear filters | Filter bar | Was "Clear all". Reason: matches the data table and memos today. |
| Multi-value | {first} and {n} others | Set chip | Unchanged ("Sam Admin and 2 others"). |

**Empty state (filters match nothing).**

> **No {companies|items|rows} match these filters.**
> Clear filters to see everything.

Where: any list screen after filtering. The second line is a sentence, and "Clear filters" is also the button.

## 4. Pane

| Label | Final | Where | Note |
|---|---|---|---|
| Section headings | Why you're seeing this; Details; History; Latest figures; Recent updates; Notes; Proof links | Pane body | Unchanged. |
| Crumb | {Place} · {n} of {total}, e.g. "Approvals · 1 of 3" | Pane top | Unchanged. |
| Step buttons (screen reader) | Previous, Next, Open full page, Close | Pane top | Unchanged. |
| Empty section lines | No figures yet. / No updates yet. / No notes yet. / No history yet. | Pane sections | Added; follows the "No {things} yet" pattern. |

## 5. Pane actions and Back

| Label | Final | Where | Note |
|---|---|---|---|
| Approve | Approve | Approval pane, primary, key `A` | Unchanged. |
| Link to a company… | Link to a company… | Approval pane, secondary, key `L` | Unchanged. The ellipsis is right: it opens a picker. |
| Open diligence | Open diligence | Diligence pane, primary | Unchanged. |
| Open the board | Open the board | Board-queue pane, primary | Unchanged. |
| Dismiss alert | Dismiss alert | Alert pane, primary, key `D` | Unchanged. The row button stays "Dismiss". |
| Open company | Open company | Alert, overdue and up-to-date panes | Unchanged. |
| Send a reminder | Send a reminder | Overdue pane, primary, key `R` | Unchanged. Row button today is "Remind"; the pane has room for the full verb. |
| Mark as unblocked | Mark as unblocked | Blocked-item pane, primary, key `U` | Unchanged. Needs a product check, see 10, choice 2. |
| Edit | Edit | Item pane | Unchanged. |
| Undo | Undo | Toast | Unchanged. |
| Back (phone, screen reader) | Back to the list | Pane top-left on a phone | Kept, though the app names the place elsewhere ("Back to Companies"). One shared pane cannot know the place without extra code; for a button read aloud, "the list" is clear. If Alvin can pass the place, use "Back to {Needs you / Companies / Team Board}". |

## 6. Action-card sentences

Each card is a heading, one or two sentences, then the buttons. Present tense, no jargon.

| Pane | Heading | Sentence | Note |
|---|---|---|---|
| Approval, with a match | Approve {name} | This signup looks like it belongs to {Company}. Approving links the account to that company. | Unchanged. |
| Approval, no match | Approve {name} | No company matches yet. You can link {Company} after approving. | Unchanged. |
| Diligence | Start with the oldest | {n} companies finished their diligence answers. | Was "Both companies…". Reason: the count changes. For one: "1 company finished its diligence answers." |
| Board queue | Match the name | Molly couldn't match a name or project on {n} items. | Was "Names or projects Molly could not match." Reason: a fragment; now says what to do and uses "couldn't" like the rest of Molly. |
| Metric alert | Check the figure | If this is expected, dismiss the alert. | Was a second sentence: "It comes back only if the figure changes again." Reason: I can't confirm that from the code, and an unproven promise on a button's card is worse than none. Add it back if Alvin confirms. |
| Behind, founder exists | No update for {n} days | The last update was {n} days ago. A reminder goes to the company's founders by email. | Was "…goes to {name}". Reason: the reminder goes to every founder (see Settings, "Emails sent"). |
| Behind, never updated | No update yet | Nothing has been sent. A reminder goes to the company's founders by email. | Uses "No update sent yet" meaning. |
| Behind, no founder | No founder in Molly | Nobody here can get a reminder. Open the company to add a founder. | New. Primary is Open company; no Send a reminder button (matches today). |
| Up to date | Up to date | The last update was {n} days ago. Nothing to do. | Unchanged. |
| Blocked item | Blocked | This item is stuck. When that's cleared, mark it as unblocked and it moves to In progress. | Was "Waiting on you" with sample text. See 10, choice 1. |
| Plain item | (no card) | | Was "Next step / Open the card to edit it." Reason: filler that points at a button already in the pane. Recommend Nisat shows Edit in the pane header and no card. |

## 7. Board (provisional, Nisat is redoing the tile markers)

| Label | Final | Where | Note |
|---|---|---|---|
| Columns | To do, In progress, Blocked, Done | Column headers | Was "To do, In progress, To review, Done". Reason: Molly's four statuses are To do, In progress, Blocked, Done (`lib/board.ts`). "To review" is not a status. |
| Tile marker, blocked | Blocked | Tile | Was "Waiting on you". See 10, choice 1. |
| Tile marker, "To review" | Remove | Tile | Same reason as columns. |
| Add | Add item | Bottom of To do | Was "Add a card". Reason: the board says "item" today. |
| Mark as unblocked toast | Item unblocked. | Toast | Was "Card unblocked". Reason: "item". |

## 8. Toasts

| Event | Final | Was |
|---|---|---|
| Approve | Approved {name}. | "{name} approved". Reason: matches "Dismissed {name}." |
| Dismiss alert | Alert dismissed. | Same as today. |
| Send a reminder | Reminder sent to {name}. | Same as today. |
| Unblock | Item unblocked. | "Card unblocked". |
| Back to old look | Back to the old look. | |
| Undo failure | Couldn't undo that. | New; matches "Couldn't undo the dismissal." |

## 9. Founder (stage 2 preview, words not final until stage 2 is approved)

| Label | Final | Where | Note |
|---|---|---|---|
| Hero eyebrow | Your next step | Top of dashboard | Unchanged. |
| Hero heading | Send your {Month} update | Hero | Unchanged. |
| Hero line | Due {day}. Your last update was {n} days ago. | Hero | Unchanged. |
| Hero button | Start the update | Hero | Unchanged. |
| Hero when nothing is due | You're up to date. | Hero | New. One sentence; no button. |
| Section headings | Latest figures; From DFS; Recent updates | Dashboard | Unchanged. |
| Company switcher | Switch company | Switcher button and drawer (screen reader) | Unchanged. |
| Empty lines | No figures yet. / Nothing from DFS yet. / No updates yet. | Sections | New; same pattern. |

## 10. Where I'd like Joseph to choose (all three decided, see the end of this section)

1. **What a blocked board item is called.** Molly's board has a status "Blocked" and no notion of who it is waiting on. Nisat's "Waiting on you" would be true only if you're the owner of a blocked item.
   - **A (recommended): "Blocked".** Matches the data and what the team already says. The red mark stays.
   - **B: "Waiting on you"** on items where you are an owner and the status is Blocked, "Blocked" for the rest. Reads more personally but is two labels for one status, and I can't tell from the code that you'd always be the one blocking.
2. **"Mark as unblocked" needs a product check.** It reads as a one-click action that moves the item to In progress. There isn't such a button today (you drag or use Move to). If the team prefers, the primary on a blocked item is plain **Edit**, as WS162 says. Not a wording choice, but the label depends on it. I recommend keeping "Mark as unblocked" if Alvin can make it a one-step move.
3. **"Try the new look" button vs a link.** I wrote it as a switch (on/off pair with "Use the old look"). If it ships as a one-time banner instead, use "Try the new look" on the button and "Not now" to dismiss.

Everything else I'd ship as listed.

**Decided by Joseph, 2026-11-16** (recorded by Nisat; the choices above stay as Nosa wrote them):

- **Choice 1: A, "Blocked".** The board uses Molly's four statuses (To do, In progress, Blocked, Done). A stuck item reads "Blocked", not "Waiting on you", and there is no "To review". "Waiting on you" stays only where it is true, such as the Needs you queue group and rows. The mockup now uses the Final words in sections 6 and 7 for the board.
- **Choice 2: yes, "Mark as unblocked".** It is the primary button on a blocked item and is one click that moves the item to In progress. Edit is the secondary. Toast: "Item unblocked."
- **Choice 3: a switch.** "Try the new look" and "Use the old look" are a switch pair, not a one-time banner, so "Not now" is not needed.

## 11. For Alvin

- Counts: always "1 signup is" / "2 signups are" (use `plural()` from `attention.ts`); the same for "1 company finished its diligence answers".
- Use sentence case everywhere; no all caps; no title case ("Needs you", "Team Board" stays as the existing page name).
- No em dashes in UI text. Bullets in this file use hyphens only for lists.
- Search and SEO do not apply: all of this is behind sign-in.
