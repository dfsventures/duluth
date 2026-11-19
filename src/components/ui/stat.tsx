import { cn } from "@/lib/utils";

// Stat (admin audit #13, #15, #31): one figure with its label. Under the new look every Stat is the
// same: a 12px sentence-case grey label, a 20/28 semibold sans number with tabular figures, and an
// optional 12px caption; no box. Under the old look the page's own classes (legacyLabel,
// legacyValue) still apply, so the old pages are unchanged.

interface StatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  /** Tooltip on the number. */
  title?: string;
  /** dt / dd (inside a <dl>) instead of two paragraphs. */
  semantic?: boolean;
  /** Old-look classes only. */
  legacyLabel?: string;
  legacyValue?: string;
  className?: string;
}

const LABEL = "v2:font-sans v2:text-meta v2:font-normal v2:normal-case v2:tracking-normal v2:text-muted-foreground";
const VALUE = "v2:tabular-nums v2:mt-0 v2:font-sans v2:text-[20px] v2:leading-7 v2:font-semibold v2:tracking-normal v2:text-foreground";

export function Stat({ label, value, caption, title, semantic, legacyLabel, legacyValue, className }: StatProps) {
  const L = semantic ? "dt" : "p";
  const V = semantic ? "dd" : "p";
  return (
    <div className={cn("min-w-0", className)}>
      <L className={cn(legacyLabel, LABEL)}>{label}</L>
      <V className={cn(legacyValue, VALUE)} title={title}>
        {value}
      </V>
      {caption && <p className="text-xs text-muted-foreground v2:text-meta">{caption}</p>}
    </div>
  );
}

/** The strip: five up, 32px between, no box, 16px under it (new look only; old pages pass their own className). */
export const STAT_STRIP = "v2:grid v2:grid-cols-2 v2:gap-x-8 v2:gap-y-4 sm:v2:grid-cols-3 lg:v2:grid-cols-5 v2:mb-4";
