// Part 19, WS45 — single source of truth for "can a browser render this
// inline," so the admin company page and the update-detail attachments
// list can't drift. Deliberately narrower than ALLOWED_UPLOAD_TYPES
// (src/lib/constants.ts) — every uploadable type is accepted, not every
// uploadable type renders inline. See Part 19 JC-VD-B for what's excluded
// and why (text/plain, video) — cheap to widen later.
const INLINE_VIEWABLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function isInlineViewable(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return INLINE_VIEWABLE_MIME_TYPES.has(mimeType.toLowerCase());
}
