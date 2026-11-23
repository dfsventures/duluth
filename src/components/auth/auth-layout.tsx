import Link from "next/link";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ui/logo-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceSync } from "@/components/layout/surface-sync";
import { V2_EYEBROW } from "@/lib/founder-look";
import { V2_AUTH_TITLE } from "@/lib/public-look";

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
  // data-v2-scope and auth-surface (PLAN-1, WS166): the new look reaches the sign-in pages under the
  // same switch as the rest of the app; every `v2:` class applies only then, so the old look is unchanged.
  return (
    <div data-surface="founder" data-v2-scope="" className="auth-surface flex min-h-screen flex-col bg-background">
      <SurfaceSync surface="founder" newLookScope />
      <header className="px-6 py-5 sm:px-10 max-md:v2:px-5 max-md:v2:py-2">
        <Link href="/" aria-label="Molly home" className="inline-flex items-center max-md:v2:min-h-11">
          <LogoMark height={22} />
        </Link>
      </header>
      <main className="flex-1 px-6 pb-16 pt-6 sm:px-10 sm:pt-12 max-md:v2:px-5">
        <div className="mx-auto w-full max-w-md">
          <p className={`font-mono text-label font-semibold uppercase tracking-label text-muted-foreground ${V2_EYEBROW}`}>{eyebrow}</p>
          <h1 className={`mt-3 font-display text-display text-foreground ${V2_AUTH_TITLE} v2:mt-1`}>{title}</h1>
          {description && <p className="mt-3 max-w-sm text-body text-secondary">{description}</p>}
          {progress && <div className="mt-5">{progress}</div>}
          <div className="mt-8">{children}</div>
          {footer && <div className="auth-footer mt-8 text-sm text-muted-foreground v2:text-row">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** Persistent error or notice: the tinted fill and deep ink pair, no accent stripe. */
export function AuthAlert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "info" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-5 rounded-md px-3 py-2.5 text-sm",
        tone === "error" ? "bg-tone-clay text-tone-clay-ink" : "bg-tone-sky text-tone-sky-ink"
      )}
    >
      {children}
    </div>
  );
}

/** "Approved, Set password, Sign in" with the current step marked. */
export function AuthSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol
      aria-label="Account setup progress"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-label uppercase tracking-label v2:gap-x-4 v2:font-sans v2:text-meta v2:normal-case v2:tracking-normal"
    >
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className={cn("flex items-center gap-2", i === current ? "font-semibold text-foreground" : "text-muted-foreground")}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-block h-[7px] w-[7px] v2:h-1.5 v2:w-1.5 v2:rounded-full",
              i < current ? "bg-acacia v2:bg-[color:var(--color-done)]" : i === current ? "bg-mark" : "bg-border v2:bg-[color:var(--color-ctl)]"
            )}
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
    <div data-v2-scope="" className="flex min-h-screen flex-col bg-background" role="status" aria-busy="true" aria-live="polite">
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
