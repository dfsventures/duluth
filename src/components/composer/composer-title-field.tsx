"use client";

interface ComposerTitleFieldProps {
  title: string;
  onTitleChange: (value: string) => void;
  period: string;
  onPeriodChange: (value: string) => void;
  periodPlaceholder?: string;
}

/**
 * Borderless display-type title + a small mono period byline beneath it
 * (Part 8, WS20.3/20.4) — the "big borderless title, no label" half of the
 * Medium-clean translation. Required data (period) is rendered as a byline
 * detail rather than a boxed form field, but the input itself is unchanged
 * (still `required`, still validated the same way server-side).
 */
export function ComposerTitleField({
  title,
  onTitleChange,
  period,
  onPeriodChange,
  periodPlaceholder = "2026-Q3",
}: ComposerTitleFieldProps) {
  return (
    // composer-title: a hook for the founder phone rule in globals.css (44px tap height on both fields).
    <div className="composer-title mb-6">
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Title"
        aria-label="Title"
        required
        data-align="title"
        className="w-full border-0 bg-transparent p-0 font-display text-3xl tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 sm:text-4xl v2:placeholder:text-muted-foreground v2:font-sans v2:text-doc-title sm:v2:text-doc-title"
      />
      <input
        value={period}
        onChange={(e) => onPeriodChange(e.target.value)}
        placeholder={periodPlaceholder}
        aria-label="Period"
        required
        data-align="desc"
        className="mt-2 w-40 border-0 bg-transparent p-0 font-mono text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 v2:placeholder:text-muted-foreground v2:font-sans v2:text-row v2:text-secondary"
      />
    </div>
  );
}
