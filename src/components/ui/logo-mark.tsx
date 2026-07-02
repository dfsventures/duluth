import { cn } from "@/lib/utils";

/** DFS's "_" signature mark, applied to the Molly wordmark. Font-size inherits from context. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("font-mono font-bold", className)}>
      <span className="text-primary-600">_</span>
      <span className="text-foreground">Molly</span>
    </span>
  );
}
