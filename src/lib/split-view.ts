// PLAN-1, WS160: the pure logic behind the list-and-pane layout. No React, no DOM, so it is
// unit-tested directly (src/lib/__tests__/split-view.test.ts).
//
// The open record lives in the URL as ?open=<id>. Other query params (a table's q, filter,
// sort, group) are left alone.

const MAX_ID = 200;

interface ParamsLike {
  toString(): string;
}

/** The id from ?open=, or null when it is missing, blank or absurdly long. */
export function parseOpenParam(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id || id.length > MAX_ID) return null;
  return id;
}

/** "" or "?a=b": the current query with `open` set to `id`, or removed when `id` is null. */
export function buildOpenQuery(base: ParamsLike, id: string | null): string {
  const params = new URLSearchParams(base.toString());
  if (id) params.set("open", id);
  else params.delete("open");
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * The key `delta` places from `current`, clamped to the ends of the list (j and k stop at the
 * first and last row rather than wrapping). With no current key, forward starts at the first
 * row and backward at the last. Returns null for an empty list.
 */
export function stepCursor(keys: readonly string[], current: string | null | undefined, delta: 1 | -1): string | null {
  if (keys.length === 0) return null;
  const i = current == null ? -1 : keys.indexOf(current);
  if (i === -1) return delta === 1 ? keys[0] : keys[keys.length - 1];
  return keys[Math.max(0, Math.min(keys.length - 1, i + delta))];
}

/**
 * Where the open record goes when it leaves the list (approved, say): the row that was below it,
 * else the one above, else null (the pane closes). `keys` is the list as it was before removal.
 */
export function nextAfterRemoval(keys: readonly string[], removed: string): string | null {
  const i = keys.indexOf(removed);
  if (i === -1) return null;
  return keys[i + 1] ?? keys[i - 1] ?? null;
}

interface ElementLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/**
 * Whether Esc belongs to the element that has focus instead of closing the pane: a field you type
 * text into (it clears or blurs), and anything inside a dialog, menu or the palette (they close
 * themselves first). A select, checkbox, radio or button does not keep it, so Esc still closes the
 * pane after you pick a match from a list.
 */
export function escapeBelongsToField(el: ElementLike | null | undefined): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return !["checkbox", "radio", "button", "submit", "reset", "range", "file"].includes((el.type ?? "text").toLowerCase());
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.('[role="dialog"],[role="alertdialog"],[role="menu"],[cmdk-root]'));
}

/** The pane crumb: "Approvals · 1 of 3". Without a position (the record is filtered out) just the place. */
export function crumbLabel(place: string, keys: readonly string[], current: string | null | undefined): string {
  const i = current == null ? -1 : keys.indexOf(current);
  return i === -1 ? place : `${place} · ${i + 1} of ${keys.length}`;
}
