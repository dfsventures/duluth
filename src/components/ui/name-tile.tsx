import { cn } from "@/lib/utils";
import { statusTone, tileTone, TONE_CLASSES } from "@/lib/status-tone";
import { identityColour } from "@/lib/identity-colour";

/**
 * 22px initial tile. Old look: a square tinted by a stable hash of the name (Sand/Sky/Sage/Clay).
 * New look (PLAN-1, WS159): an identity mark. `kind="company"` (the default, and what every
 * existing call site is) is a rounded square; `kind="person"` is a disc. The fill comes from
 * `identityColour(name)`, passed as a CSS variable so the old look never reads it. Decorative.
 */
export function NameTile({
  name,
  kind = "company",
  className,
}: {
  name: string;
  kind?: "company" | "person";
  className?: string;
}) {
  const id = identityColour(name);
  return (
    <span
      aria-hidden="true"
      style={{ "--id-fill": id.fill, "--id-ink": id.ink } as React.CSSProperties}
      className={cn(
        "mr-2.5 inline-grid h-[22px] rounded-sm w-[22px] shrink-0 place-items-center font-display text-[11px] font-semibold",
        TONE_CLASSES[tileTone(name)].chip,
        // New look: identity fill, near-black initial (IDENTITY_INK), 1px inset ring at 14% ink.
        "v2:bg-[var(--id-fill)] v2:text-[color:var(--id-ink)] v2:shadow-[inset_0_0_0_1px_rgb(20_22_26/0.14)]",
        kind === "person" ? "v2:rounded-full" : "v2:rounded",
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
    <span className={cn("inline-block rounded-sm px-2 py-0.5 text-xs font-medium", TONE_CLASSES[statusTone(stage)].chip, className)}>
      {stage}
    </span>
  );
}
