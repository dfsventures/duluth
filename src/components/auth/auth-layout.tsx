import Link from "next/link";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ui/logo-mark";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * First-impression layout for login, signup and set-password (UI overhaul
 * phase 5). Adopts the LP portal's treatment, the best typography in the app:
 * left-aligned display headline, mono eyebrow, no bordered centred card.
 * Comfortable density (40px fields, 44px buttons) because these are occasional,
 * often phone, visits.
 */
export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
  progress,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Optional step line under the description (set-password). */
  progress?: React.ReactNode;
}) {
  return (
    <div data-surface="founder" className="flex min-h-screen flex-col bg-background">
      <header className="px-6 py-5 sm:px-10">
        <Link href="/" aria-label="Molly home" className="inline-flex items-center">
          <LogoMark />
        </Link>
      </header>
      <main className="flex-1 px-6 pb-16 pt-6 sm:px-10 sm:pt-12">
        <div className="mx-auto w-full max-w-md">
          <p className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-3 font-display text-display text-foreground">{title}</h1>
          {description && <p className="mt-3 max-w-sm text-body text-secondary">{description}</p>}
          {progress && <div className="mt-5">{progress}</div>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** Persistent error or notice: a left rule and the tinted pair, not a boxed banner. */
export function AuthAlert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "info" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-5 border-l-2 px-3 py-2.5 text-sm",
        tone === "error"
          ? "border-laterite bg-tone-clay text-tone-clay-ink"
          : "border-sky bg-tone-sky text-tone-sky-ink"
      )}
    >
      {children}
    </div>
  );
}

/** "Approved, Set password, Sign in" with the current step marked. */
export function AuthSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="Account setup progress" className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-label uppercase tracking-label">
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className={cn("flex items-center gap-2", i === current ? "font-semibold text-foreground" : "text-muted-foreground")}
        >
          <span
            aria-hidden="true"
            className={cn("inline-block h-[7px] w-[7px]", i < current ? "bg-acacia" : i === current ? "bg-sky" : "bg-bone")}
          />
          {s}
          {i < current && <span className="sr-only"> (done)</span>}
        </li>
      ))}
    </ol>
  );
}

/** Matches AuthLayout, so the page does not jump when the real form arrives. */
export function AuthSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="px-6 py-5 sm:px-10">
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="flex-1 px-6 pt-6 sm:px-10 sm:pt-12">
        <div className="mx-auto w-full max-w-md space-y-4 sm:mx-0 sm:ml-[max(0px,calc(50vw-14rem))]">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <div className="space-y-3 pt-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
