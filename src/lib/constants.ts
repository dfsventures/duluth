export const DOC_TYPES = [
  { value: "pitch_deck", label: "Pitch Deck" },
  { value: "financials", label: "Financials" },
  { value: "legal", label: "Legal" },
  { value: "product", label: "Product / Demo" },
  { value: "other", label: "Other" },
] as const;

export type DocType = (typeof DOC_TYPES)[number]["value"];
