# Part 37 — Board and digest composer UI fixes (design spec)

Scope: visual/UX polish plus one refresh bug on `/admin/board` and the digest composer todo rows.
No new dependencies, no schema or API changes. Brand tokens only (Paper / Bone / Obsidian / Sky, ochre = warning, laterite = danger; flat 0-2px corners; light theme).
All names below are synthetic (Jane Founder, Sam Partner, AcmeHQ onboarding).

Priority: MUST / SHOULD / NICE. Line numbers are as of commit b0d9f3b.

---

## 1. One select treatment, fixed at the shared level (MUST)

### Root cause
There are two competing select implementations:

1. `src/components/ui/select.tsx` (used by the card/resolve dialogs and most admin pages) sets `appearance-none pr-9` and draws a lucide `ChevronDown` overlay.
2. Bare `<select>` elements get the browser's native control. These are: board filters (`src/app/admin/board/page.tsx:258` `selectCls`, lines 301 and 318), the card "Move to" (`src/components/admin/board/board-card.tsx:108`), the composer owner/project selects (`src/app/admin/digest/new/page.tsx:314,325`, and `src/app/admin/digest/[id]/page.tsx`), plus `src/app/admin/portfolio/[id]/page.tsx:665`, `src/app/updates/new/page.tsx:298` and `src/app/admin/approvals/page.tsx`.

`src/app/globals.css` has no `select` rule at all (only a focus-visible reset at line 78). The native macOS/Chromium arrow is drawn in its own inset sub-box when `appearance` is left alone and the element has custom border/padding. That sub-box is the "separate segment" circled in red. The composer selects are `.input-field` with `w-auto`, so their width tracks the longest option and the arrow position drifts per select (row 1 vs row 2 in the screenshot).

### Fix (global, one place)
**a) `src/app/globals.css`, inside the existing `@layer base { ... }` block, after the `input:focus-visible ...` rule (about line 83), add:**

```css
  /* One select treatment for the whole app: native control, our chevron.
     Specificity (0,2,1) deliberately beats utility px-*/pr-* on any select,
     so no call site can reintroduce a cramped arrow. Chevron stroke is
     --color-text-muted (#66645A). Multi-selects and listboxes are excluded. */
  select:not([multiple]):not([size]) {
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2366645A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.625rem center;
    background-size: 1rem 1rem;
    padding-right: 2.25rem;
    text-overflow: ellipsis;
  }
  select:not([multiple]):not([size]):disabled {
    opacity: 0.5;
  }
```

`bg-card` only sets `background-color`, so it does not clobber the chevron image. No change is needed to `.input-field`.

**b) `src/components/ui/select.tsx`:** remove the overlay chevron so we do not render two arrows.
- Delete the `ChevronDown` import (line 6) and the `<ChevronDown ... />` element (line 36).
- Change `className={cn("input-field appearance-none pr-9", className)}` to `className={cn("input-field", className)}`.
- Keep the `relative` wrapper `div` (harmless) or flatten it; either is fine.
- Update the comment block (lines 11-18) to say the chevron now lives in `globals.css`.

**c) Call-site cleanup (so classes stop contradicting the base rule):**
- `src/app/admin/board/page.tsx:258`: `selectCls` becomes `"h-9 w-full rounded-sm border border-input bg-card pl-3 text-sm text-foreground sm:w-44"` (drop `px-2`; the base rule owns right padding).
- `src/components/admin/board/board-card.tsx:108`: className becomes `"h-8 min-w-0 flex-1 rounded-sm border border-input bg-card pl-2 text-xs text-foreground"` (h-7 to h-8, see fix 9).
- Composer selects (`new/page.tsx:314,325` and the matching two in `[id]/page.tsx`): see fix 5 for the full class string.

### Regression check (Alvin, after the change)
Look at every select in the list above plus every `<Select>` user (`approvals`, `portfolio`, `portfolio/[id]`, `funds/[id]`, `companies/new` and `[id]`, `reports`, `updates`, `providers`, `team`, `company/profile`, `company/documents`). Confirm: exactly one chevron, 8-10px from the right border, long option text ellipsises instead of running under the arrow, disabled state still dimmed, focus ring (`.input-field` ring) intact. Chevron colour is the muted token, not Sky, so it never reads as a link.

---

## 2. "Needs review" belongs in the banner, not the filter row (MUST)

File: `src/app/admin/board/page.tsx`.

- **Delete** the chip `<button aria-pressed={reviewOnly} ...>Needs review</button>` (lines 334-344).
- **Replace** the banner block (lines 354-366). Render it only when `needsReviewCount > 0`. The banner carries the toggle in both states:

```tsx
{needsReviewCount > 0 && (
  <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border border-ochre bg-ochre/10 px-3 py-2">
    <AlertCircle className="h-4 w-4 shrink-0 text-ochre" aria-hidden />
    <p className="min-w-0 flex-1 basis-48 text-sm text-foreground">
      {reviewOnly
        ? `Showing ${needsReviewCount} item${needsReviewCount === 1 ? "" : "s"} that need review`
        : `${needsReviewCount} item${needsReviewCount === 1 ? " needs" : "s need"} review: names or projects Molly couldn't match`}
    </p>
    <Button size="sm" variant="secondary" className="shrink-0"
      onClick={() => setFilter("review", reviewOnly ? "" : "1")}>
      {reviewOnly ? "Show all" : "Show them"}
    </Button>
  </div>
)}
```
- Import `AlertCircle` from `lucide-react` (already used in `board-card.tsx`, same glyph as the card's "!" so the banner and the cards read as one system).
- **Contrast:** the current text is `text-ochre` (#C9963A on Paper is roughly 2.4:1, fails AA). Body text becomes `text-foreground`; ochre is carried by the 1px border, the `bg-ochre/10` wash and the icon only.
- **Behaviour:** `?review=1` is unchanged (`reviewOnly` still read from the URL and still filters in `matches`).
- **Stuck-filter guard:** if the last flagged card is resolved while `?review=1` is on, the banner disappears and the board shows four empty columns with no visible reason. Add after the `load` effect:

```tsx
useEffect(() => {
  if (reviewOnly && data && needsReviewCount === 0) setFilter("review", "");
}, [reviewOnly, data, needsReviewCount, setFilter]);
```
  (`needsReviewCount` is declared at line 257; move the effect below it.)
- The filter row now holds only Project, Owner, Search. Remove the chip's `cn(...)` usage if `cn` becomes unused there (it is still used by the tabs).

---

## 3. Board does not refresh after edit / resolve (MUST)

### What the code actually does
`load()` (`page.tsx:73`) is already called from `CardDialog.onSaved` (line 426) and `ResolveDialog.onResolved` (line 438), so the call exists. The staleness comes from how it is wired:

1. **Resolve dialog only refreshes on "Done" or close.** In `resolve-dialog.tsx` the server write happens in `submit()` (line 43-55) and the dialog flips to the "Resolved." screen; `onResolved` (hence `load`) only fires on the Done button or `onOpenChange` (line 74, 133). While that confirmation screen is up, the board behind it, the "!" icon and the banner count are stale. This matches the report.
2. **Edit dialog skips refresh on partial failure.** `card-dialog.tsx:62-77`: PATCH succeeds, then the follow-up `/move` (status change) fails and throws, so `onSaved()` is never reached. The data is saved but the board is stale and the dialog shows an error.
3. **No visible transition.** The dialog unmounts immediately and `load()` is fire-and-forget; with no optimistic update there is a flash of stale state, and nothing signals a refetch is in flight.
4. **Unordered responses.** `load()` has no sequencing. A slow `load()` response can land after a newer optimistic `move()` and overwrite it, or overwrite a newer `load()`.
5. **The count is server-only.** `needsReviewCount` comes only from the GET payload, so it cannot update until a successful refetch.
6. **Fetch cache.** The GET at `page.tsx:75` is a bare `fetch()`; the route is `force-dynamic` but add `cache: "no-store"` so nothing in the stack serves a cached payload.

### Fix
**a) `src/app/admin/board/page.tsx`, `load` (lines 73-87):** add a sequence guard and no-store.

```tsx
const loadSeq = useRef(0);
const load = useCallback(async () => {
  const seq = ++loadSeq.current;
  try {
    const res = await fetch("/api/admin/board", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load the board.");
    const json = await res.json();
    if (seq !== loadSeq.current) return; // a newer load started; drop this one
    setData(json);
    setLoadError("");
  } catch (e) {
    if (seq !== loadSeq.current) return;
    setLoadError(e instanceof Error ? e.message : "Failed to load the board.");
  } finally {
    if (seq === loadSeq.current) setLoading(false);
  }
}, []);
```
Also in `move()` (line 131) call `loadSeq.current++` before the optimistic `setData` so an older in-flight load cannot overwrite it.

**b) Apply the saved card instantly, then reconcile.** Add a helper in the page:

```tsx
function applyCard(saved: BoardCardData | null) {
  if (saved) {
    setData((cur) => {
      if (!cur) return cur;
      const exists = cur.cards.some((c) => c.id === saved.id);
      const cards = saved.archivedAt
        ? cur.cards.filter((c) => c.id !== saved.id)
        : exists ? cur.cards.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)) : [...cur.cards, saved];
      return { ...cur, cards, needsReviewCount: cards.filter((c) => c.needsReview).length };
    });
  }
  load(); // always reconcile: other cards may have changed (resolve fixes siblings, ordering)
}
```

**c) `CardDialog` (`card-dialog.tsx`):** change prop `onSaved: () => void` to `onSaved: (card?: BoardCardData) => void`.
- Create: `const created = await res.json(); ... onSaved(created)`.
- Edit: keep the PATCH response (`const saved = await res.json()`), and after an optional move call `onSaved({ ...saved, ...(status !== card.status ? { status } : {}) })`.
- Partial failure (move failed after PATCH succeeded): call `onSaved(saved)` first (so the board refreshes with what did persist), then still show/keep the error. Simplest: wrap, i.e. in the `catch` of the move step, call `onSaved(saved)` and rethrow only if you want the dialog to stay open; recommended: close the dialog, and surface the message via the page's existing `moveError` banner ("Saved, but moving the item failed.").
- Archive: after the PATCH call `onSaved({ ...(await res.json()) })` (it has `archivedAt` set, so `applyCard` removes it).
- In the page, `onSaved={(c) => { setEditing(null); applyCard(c ?? null); }}`.

**d) `ResolveDialog` (`resolve-dialog.tsx`):** add a prop `onApplied: (card: BoardCardData | null) => void`. In `submit()` right after the successful parse (line 52), call `onApplied(d?.card ?? null)` before `setFixed(...)`. The page passes `onApplied={(c) => applyCard(c)}` (does not close the dialog); keep `onResolved` for closing only (`setResolving(null)`, no second load needed, though harmless). The board behind the confirmation screen is now already correct, so the "!" and banner clear the moment the server confirms.

**e) Result:** after any create/edit/resolve/archive/move the card, the "!" icon and the banner count update immediately from the response, and a background `load()` corrects anything else (sibling cards fixed by an alias resolve, column order). `needsReviewCount` is recomputed locally from `cards`; this differs from the server count only for open flagged cards in DONE older than 14 days, which `load()` corrects within the same second.

Add a unit test only if Alvin already has a board page harness; otherwise verify manually: edit a flagged card to a valid owner/project, "!" and banner disappear without reload; resolve via the dialog, banner count drops while the "Resolved." screen is still showing.

---

## 4. Composer: reserve the review-dot slot (MUST)

Files: `src/app/admin/digest/new/page.tsx` (todo row at lines 289-299) and the identical row in `src/app/admin/digest/[id]/page.tsx`.

The ochre dot is rendered only when `unresolved(todo)`, so a resolved row's input starts at the left edge and an unresolved row's input is pushed right by 16px (dot 8px + `gap-2`). Always render the slot:

```tsx
<span
  className={cn("h-2 w-2 shrink-0 rounded-full", unresolved(todo) ? "bg-ochre" : "bg-transparent")}
  title={unresolved(todo) ? "Needs review" : undefined}
  aria-label={unresolved(todo) ? "Needs review" : undefined}
  aria-hidden={!unresolved(todo)}
/>
```
(Import `cn` from `@/lib/utils` if not already imported.) The meta row below uses `pl-0 sm:pl-4` (line 307); make it `pl-4` at all widths so selects stay aligned under the text input at 375px too. The "Add a todo..." row (line 372) should get the same `pl-4` so all three inputs share one left edge.

---

## 5. Composer: select widths and the "heard as" notes (SHOULD)

Same two files. The selects use `w-auto sm:min-w-40`, so each sizes to its selected option (row 1 "Jane Founder" is narrower than row 2 "No owner"/project). Fixed widths plus the notes moved to their own line:

- Both selects: `className="input-field h-9 w-full text-xs sm:w-44"` (identical class string on both, both rows; the global rule from fix 1 supplies the chevron and padding).
- Meta row container: `flex flex-wrap items-center gap-2 pl-4`.
- Replace the three trailing `<span>`s (lines 336-344) with one full-width line so they stop wrapping mid-row beside the selects:

```tsx
{(todo.heardOwner || todo.heardProject || todo.existingCardId) && (
  <p className="basis-full text-xs leading-5 text-muted-foreground">
    {todo.heardOwner && <>Owner heard as <span className="font-mono">&lsquo;{todo.heardOwner}&rsquo;</span>. </>}
    {todo.heardProject && <>Project heard as <span className="font-mono">&lsquo;{todo.heardProject}&rsquo;</span>. </>}
    {todo.existingCardId && <>Already on the board.</>}
  </p>
)}
```
  Example rendering: "Owner heard as 'Jayne'. Project heard as 'AcmeHQ onboring'." Quoting in mono makes the raw misheard text legible and distinct from the explanation. The `basis-full` forces it onto its own line under the selects at every width.
- Row separation: `<li>` already has `border-b ... pb-2`; change to `pb-3` and list `space-y-3` so the stacked rows breathe.

---

## 6. Board filter row alignment and labels (SHOULD)

File: `src/app/admin/board/page.tsx` lines 298-352.

- Container: `mb-4 flex flex-wrap items-end gap-x-4 gap-y-3`.
- Each filter `<label>` becomes `flex w-full flex-col gap-1 sm:w-auto` and its caption uses the app's label style: `<span className="label">Project</span>` / `Owner` (mono, uppercase, tracking-widest; matches the dialogs' labels). The select inside uses the new `selectCls` (fixed `sm:w-44`, fix 1c). The "Owner" caption currently sits against the Project select's chevron because both selects are content-sized with a 12px gap; fixed widths plus `gap-x-4` give a stable 16px gutter, and the select no longer reflows when the chosen option changes.
- Search: wrap-free and consistent with selects: `className="h-9 w-full sm:w-56"`, and give it a matching caption so it lines up on the same baseline: `<label className="flex w-full flex-col gap-1 sm:w-auto"><span className="label">Search</span><Input .../></label>`. (The `Input` has an `aria-label`; keep it.)
- At 375px all three stack full-width; at sm+ they sit in one row.

---

## 7. Card layout, density and footer (SHOULD)

File: `src/components/admin/board/board-card.tsx`.

- **Title row (line 62):** `flex flex-wrap items-start gap-2` with `min-w-48 flex-1` lets the "!" button wrap under the title in a ~220px desktop column (192px min-width plus icon). Change to `flex items-start gap-2` and the text block to `min-w-0 flex-1`. The "!" stays top-right at every width. Give the "!" button a larger hit area: `-m-1 shrink-0 rounded-sm p-1 text-ochre hover:bg-ochre/10` (keeps visual size, ~24px target).
- **Metadata (lines 90-102):** owner on its own line reads as the primary meta; project chip and due date follow. Owner: `font-mono text-xs text-foreground` (currently same muted grey as everything else; Obsidian gives the card a clear second level). Project chip keeps `border border-border px-1.5 py-0.5 rounded-sm text-muted-foreground`. Due date unchanged (laterite when overdue). Container `mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5`.
- **Controls row:** see fix 9 for heights; unchanged structure.
- **Footer "moved by ... · just now" (lines 144-148):** it wraps ("just / now") in a narrow column. Make it one line that truncates the name, never the time:

```tsx
<p className="mt-2 flex min-w-0 gap-1 font-mono text-[11px] text-muted-foreground" title={`Moved by ${movedBy}, ${timeAgo(card.updatedAt)}`}>
  <span className="truncate">moved by {movedBy}</span>
  <span className="shrink-0">· {timeAgo(card.updatedAt)}</span>
</p>
```
  (11px instead of 10px; 10px mono is below comfortable legibility on Paper.) Also have `timeAgo` in `types.ts` stay as is; "5m" without "ago" is acceptable in this compact footer.
- Card padding stays `p-3`; gaps above (`mt-2`) already 8px, which is the right density. Do not add shadows.
- Notes preview `line-clamp-2` is fine.

---

## 8. Empty columns (SHOULD)

File: `src/components/admin/board/board-column.tsx` line 36. The stretched grey block with a left-aligned "Nothing here." reads like an error. Replace with a quiet, centred hint, and make it a clear drop target while dragging:

```tsx
{count === 0 && (
  <p className="py-6 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
    {isDropTarget ? "Drop here" : "Empty"}
  </p>
)}
```
Column body: keep `min-h-24 flex-1 space-y-2 rounded-sm bg-muted/40 p-2` (grid stretch keeps all four the same height, which is what makes drops forgiving). Mobile `<details>` empty state (`page.tsx:405`): same `Empty` treatment, `py-3 text-center`. When a project/owner/search filter produces empty columns, no extra text is needed.

---

## 9. Control heights and touch targets (SHOULD)

- Card "Move to" select and the up/down arrows are 28px (`h-7 w-7`). Make all three `h-8` / `h-8 w-8` (32px). On mobile (the stacked `<details>` list, where these are the only way to reorder) use `h-10`/`h-10 w-10` below `md`: `h-10 md:h-8` and `h-10 w-10 md:h-8 md:w-8`.
- Mobile section summaries (`page.tsx:399`): `px-3 py-2` to `px-3 py-3` for a ~44px target, and add a rotating chevron so the section reads as expandable: `<summary className="... [&::-webkit-details-marker]:hidden">` with a trailing `ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180"` and `group` on the `<details>`.
- Primary button "Add item" (`PageHeader` action) is fine; confirm it does not wrap under the title at 375px (title/description left, button below is acceptable).

---

## 10. Tabs clipping (SHOULD)

File: `page.tsx:275`. `Tabs.List` has `overflow-x-auto`, which makes `overflow-y` compute to `auto` too, so the `-mb-px` 2px active border and trigger text can be clipped or produce a 1px vertical scrollbar (the screenshot shows the label row cropped at the top). There are only two short tabs, so drop the overflow container:

`className="mb-6 flex gap-6 border-b border-border"`.
Triggers (line 281): `px-1 pb-2` to `px-1 pb-2.5 pt-1`, keep `-mb-px`, `shrink-0`, mono uppercase style. When the Intake tab is added (WS109), reintroduce `overflow-x-auto` with `[scrollbar-width:none]` and `py-1` instead. Also verify at the top of the page that `PageHeader` provides enough bottom margin so the tab row is never cut by the sticky header.

---

## 11. Mobile (375px) checks (SHOULD)

After fixes 1-10, verify at 375px:
- Filters stack full width (fix 6); banner action wraps under the text (fix 2).
- Composer: input row with dot slot, selects stacked full-width and indented 16px, heard-as note on its own line; remove (X) button never overflows.
- Card dialog (`max-w-lg`, `w-[calc(100vw-2rem)]`): grid collapses to one column below `sm`; Archive/Cancel/Save row wraps without horizontal scroll.
- Desktop four-column grid and the mobile `<details>` list both render the same cards into the DOM (duplicated `aria-label`s). NICE: gate rendering with a single `matchMedia` hook so only one list mounts. Out of scope unless trivial.

---

## 12. Small polish (NICE)

- `page.tsx:294` load-error text should offer "Try again" (`<Button size="sm" variant="secondary" onClick={load}>`).
- `moveError` (line 368) should clear after ~5s or on the next successful action; currently it persists until the next move.
- Loading state (`Loading...`, line 292): replace with four skeleton column headers so layout does not jump (only if cheap).
- In the composer, make the red "needs review" dot's `title` text actionable: "Needs review: pick an owner/project or leave empty to dismiss".

---

## Implementation order for Alvin
1. Fix 1 (globals.css + select.tsx + call sites), then visual regression pass across the select list.
2. Fix 3 (refresh) with fix 2 (banner), since both touch `page.tsx`.
3. Fixes 4-5 (composer), 6-10 (board polish), then the 375px pass.
Files touched in total: `src/app/globals.css`, `src/components/ui/select.tsx`, `src/app/admin/board/page.tsx`, `src/components/admin/board/{board-card,board-column,card-dialog,resolve-dialog}.tsx`, `src/app/admin/digest/new/page.tsx`, `src/app/admin/digest/[id]/page.tsx`.
