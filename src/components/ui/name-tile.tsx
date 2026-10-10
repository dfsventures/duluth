import { cn } from "@/lib/utils";
import { statusTone, tileTone, TONE_CLASSES } from "@/lib/status-tone";

/** 22px square initial tile, tinted by a stable hash of the name. Decorative. */
export function NameTile({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mr-2.5 inline-grid h-[22px] w-[22px] shrink-0 place-items-center font-display text-[11px] font-semibold",
        TONE_CLASSES[tileTone(name)].chip,
        className
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Funding-stage chip: Pre-seed sand, Seed sky, Series A sage, anything else stone. */
export function StageChip({ stage, className }: { stage: string | null | undefined; className?: string }) {
  if (!stage) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-block px-2 py-0.5 text-xs font-medium", TONE_CLASSES[statusTone(stage)].chip, className)}>
      {stage}
    </span>
  );
}
