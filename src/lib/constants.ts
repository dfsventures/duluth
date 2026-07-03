export const DOC_TYPES = [
  { value: "pitch_deck", label: "Pitch Deck" },
  { value: "financials", label: "Financials" },
  { value: "legal", label: "Legal" },
  { value: "product", label: "Product / Demo" },
  { value: "other", label: "Other" },
] as const;

export type DocType = (typeof DOC_TYPES)[number]["value"];

// Server-side upload validation: MIME type → allowed file extensions.
// Keep in sync with what founders actually upload (decks, financials,
// legal docs, product demos). SVG is deliberately excluded (XSS vector).
export const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-powerpoint": ["ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "text/csv": ["csv"],
  "text/plain": ["txt"],
  "application/zip": ["zip"],
  "video/mp4": ["mp4"],
  "video/quicktime": ["mov"],
};
