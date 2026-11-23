import type { Metadata } from "next";
import Link from "next/link";
import { getLp } from "@/lib/lp-auth";
import { LpSignOutButton } from "@/components/lp/lp-sign-out-button";
import { ORG_NAME, ORG_LOGO_PATH } from "@/lib/org";
import { SurfaceSync } from "@/components/layout/surface-sync";
import { V2_EYEBROW } from "@/lib/founder-look";

// Confidential LP surface on an otherwise public (MIT) app — never index it.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const LOGO_REVERSE_PATH = ORG_LOGO_PATH === "/brand/dfs-logo-primary.png" ? "/brand/dfs-logo-reverse.png" : null;

/**
 * Minimal public chrome for the LP portal (Part 7, WS18.4) — deliberately
 * NOT AppShell (the founder/admin sidebar shell). Aesthetic follows
 * www.dfs.vc: Paper canvas, mono eyebrow labels, line dividers, no cards.
 * `lp-print-scope` is targeted by the WS19 print stylesheet in globals.css.
 *
 * data-v2-scope (PLAN-1, WS166): the new look reaches the LP portal under the same switch as the
 * rest of the app (nothing changes unless <html data-look="v2"> is set). Every `v2:` class below
 * applies only then; the old look renders exactly as before.
 */
export default async function LpLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getLp();

  return (
    <div data-surface="founder" data-v2-scope="" className="lp-print-scope flex min-h-screen flex-col bg-background text-foreground">
      <SurfaceSync surface="founder" newLookScope />
      <header className="flex items-center justify-between border-b border-border px-6 py-5 print:hidden sm:px-10 v2:min-h-[var(--bar-h)] v2:py-2 max-md:v2:px-5">
        <Link href="/lp" className="flex items-center gap-2 max-md:v2:min-h-11">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ORG_LOGO_PATH} alt={ORG_NAME} width={72} height={30} className={LOGO_REVERSE_PATH ? "v2dark:hidden" : undefined} />
          {/* The new look's dark theme: the white logo. Only when the default logo is in use (a custom
              ORG_LOGO_PATH has no known reverse file, so it stays as it is). */}
          {LOGO_REVERSE_PATH && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={LOGO_REVERSE_PATH} alt={ORG_NAME} width={72} height={30} className="hidden v2dark:block" />
          )}
        </Link>
        {ctx && <LpSignOutButton />}
      </header>

      <main className="flex-1 px-6 py-12 sm:px-10 sm:py-16 max-md:v2:px-5 max-md:v2:py-8">{children}</main>

      <footer className="border-t border-border px-6 py-6 text-xs text-secondary print:hidden sm:px-10 v2:text-meta max-md:v2:px-5">
        <p className={`font-mono uppercase tracking-[0.1em] text-muted-foreground ${V2_EYEBROW} v2:font-medium`}>{ORG_NAME}</p>
        <p className="mt-1">Fund reports for our limited partners.</p>
      </footer>
    </div>
  );
}
