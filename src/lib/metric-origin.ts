// Label for the admin-only chip on a figure Marge filed with an update. A figure Marge read from a file
// attached to the email says so; everything else Marge filed (including legacy rows with no origin) reads
// "from email". Returns null when the figure was not filed by Marge (no chip).
export function metricChipLabel(mv: { via?: string | null; origin?: string | null }): string | null {
  if (mv.via !== "marge") return null;
  return mv.origin === "attachment" ? "from attached file" : "from email";
}
