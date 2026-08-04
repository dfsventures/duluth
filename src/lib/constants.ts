export const DOC_TYPES = [
  { value: "pitch_deck", label: "Pitch Deck" },
  { value: "financials", label: "Financials" },
  { value: "legal", label: "Legal" },
  { value: "product", label: "Product / Demo" },
  // Part 16, WS40 — due-diligence intake document types.
  { value: "cap_table", label: "Cap Table / Investor Docs" },
  { value: "bank_statements", label: "Bank Statements" },
  { value: "certificate_of_incorporation", label: "Certificate of Incorporation" },
  { value: "business_license", label: "Business License" },
  { value: "passport", label: "Founder Passport" },
  { value: "other", label: "Other" },
] as const;

// Part 16, WS40 — the 5 due-diligence-specific document types, in the
// order the founder checklist page renders their upload rows.
export const DD_DOC_TYPES = DOC_TYPES.filter((t) =>
  ["cap_table", "bank_statements", "certificate_of_incorporation", "business_license", "passport"].includes(t.value)
);

export type DocType = (typeof DOC_TYPES)[number]["value"];

// Part 20, WS46 — hoisted out of src/app/diligence/page.tsx so the new
// founder documents page (WS47) can apply the identical auto-tagging
// rule without a second, driftable copy of this set.
export const AUTO_INTERNAL_DOC_TYPES = new Set(["passport", "bank_statements"]);

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
