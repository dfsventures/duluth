import type { Metadata } from "next";
import Link from "next/link";
import { getLp } from "@/lib/lp-auth";
import { LpSignOutButton } from "@/components/lp/lp-sign-out-button";
import { ORG_NAME } from "@/lib/org";

// Confidential LP surface on an otherwise public (MIT) app — never index it.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Minimal public chrome for the LP portal (Part 7, WS18.4) — deliberately
 * NOT AppShell (the founder/admin sidebar shell). Aesthetic follows
 * www.dfs.vc: Paper canvas, mono eyebrow labels, line dividers, no cards.
 * `lp-print-scope` is targeted by the WS19 print stylesheet in globals.css.
 */
export default async function LpLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getLp();

  return (
    <div className="lp-print-scope flex min-h-screen flex-col bg-paper text-obsidian">
      <header className="flex items-center justify-between border-b border-bone px-6 py-5 print:hidden sm:px-10">
        <Link href="/lp" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/dfs-logo-primary.png" alt={ORG_NAME} width={72} height={30} />
        </Link>
        {ctx && <LpSignOutButton />}
      </header>

      <main className="flex-1 px-6 py-12 sm:px-10 sm:py-16">{children}</main>

      <footer className="border-t border-bone px-6 py-6 text-xs text-tide print:hidden sm:px-10">
        <p className="font-mono uppercase tracking-[0.1em] text-muted-foreground">{ORG_NAME}</p>
        <p className="mt-1">Fund reports for our limited partners.</p>
      </footer>
    </div>
  );
}
