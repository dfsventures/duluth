import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  /** Omit for the current page (last crumb). */
  href?: string;
}

/**
 * Wayfinding line above a detail page's title ("Companies / AcmeHQ"). The last
 * crumb is the current page and is not a link. Replaces the old "Back to X"
 * buttons: the parent crumb does the same job and shows where you are.
 */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("mb-3", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {c.href && !last ? (
                <Link href={c.href} className="hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last && "text-foreground")}>
                  {c.label}
                </span>
              )}
              {!last && <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
