import { cn } from "@/lib/utils";
import { statusTone, TONE_CLASSES, type Tone } from "@/lib/status-tone";

interface StatusDotProps {
  /** A status/stage string resolved through statusTone(), or pass `tone` directly. */
  status?: string | null;
  tone?: Tone;
  children?: React.ReactNode;
  className?: string;
}

/**
 * 7px SQUARE marker plus the status word (the flat system uses squares, not
 * circles). Text stays Obsidian; colour lives in the marker only, which is what
 * keeps this AA-safe with the solid brand hues.
 */
export function StatusDot({ status, tone, children, className }: StatusDotProps) {
  const t = tone ?? statusTone(status);
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-foreground", className)}>
      <span aria-hidden="true" className={cn("inline-block h-[7px] w-[7px] shrink-0", TONE_CLASSES[t].dot)} />
      {children ?? status}
    </span>
  );
}
