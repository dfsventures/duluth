"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar, SIDEBAR_ID } from "./sidebar";
import { LogoMark } from "@/components/ui/logo-mark";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { Shortcuts } from "./shortcuts";
import { SurfaceSync } from "./surface-sync";
import { surfaceForPath, type Surface } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { useNewLook } from "@/lib/use-new-look";

export const MAIN_ID = "main-content";

interface AppShellProps {
  children: React.ReactNode;
  /**
   * "page" (default) is today's centred column. "full" is for pages that lay out their own
   * list and pane (PLAN-1, WS160): under the new look it drops the column and the padding.
   * Under the old look both are the same box, so a page can pass "full" before it is ready.
   * "wide" is for pages whose main content is a wide table: under the new look the content fills the
   * space between the two gutters (--column-wide has no cap). "narrow" (720) is for editors, forms and
   * Settings: the header bar, the Save / Send buttons and the content share one narrow column.
   * "detail" and "detail-wide" are for the
   * Dossier pages (main column plus panel; 1056 and 1296 wide, the fund page being the wide one).
   * Under the new look every width except "full" is the same frame: a gutter each side, a content width
   * (--frame), centred in the main area, with the header bar on the same column. Under the old look all
   * of them, "full" included, are the same box as "page".
   */
  width?: "page" | "narrow" | "wide" | "full" | "detail" | "detail-wide";
  /**
   * Overrides the surface the path would give. For a page shared with founders and LPs (outside
   * /admin) that shows an admin the new look: it passes "admin" only for an admin with the new look
   * on, and nothing otherwise, so every other viewer keeps the surface the path gives.
   */
  surface?: Surface;
}

export function AppShell({ children, width = "page", surface: surfaceOverride }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  // Direction B applies to founder-facing surfaces only; admin keeps Direction A+.
  const pathSurface = surfaceForPath(usePathname());
  const surface = surfaceOverride ?? pathSurface;
  // The palette and shortcuts are admin only in v1 (spec decision 3).
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes("ADMIN") ?? false;
  const newLook = useNewLook();

  // Phone drawer: Esc closes it, focus moves into it on open and back to the
  // menu button on close, so keyboard and screen reader users are not stranded.
  useEffect(() => {
    if (!sidebarOpen) return;
    const button = menuButton.current;
    document.getElementById(SIDEBAR_ID)?.querySelector<HTMLElement>("a[href], button")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // New look, layered Esc (PLAN-1, WS164): a menu or dialog open on top closes first (it
      // marks the event handled), and the drawer then takes this Esc so the pane or filters
      // under it stay put. The old look keeps closing the drawer on any Esc.
      if (newLook) {
        if (e.defaultPrevented) return;
        e.preventDefault();
      }
      setSidebarOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [sidebarOpen, newLook]);

  return (
    // h-dvh, not h-screen — see the note in sidebar.tsx
    <div className="flex h-dvh overflow-hidden" data-surface={surface} data-drawer-open={sidebarOpen ? "" : undefined}>
      <SurfaceSync surface={surface} />
      {/* Skip link: only exists under the new look, only visible when focused (see globals.css) */}
      <a href={`#${MAIN_ID}`} className="skip-link hidden">
        Skip to main content
      </a>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-[color:var(--scrim)] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} surface={surfaceOverride} />
      {isAdmin && (
        <>
          <CommandPalette />
          <Shortcuts />
        </>
      )}

      <main id={MAIN_ID} tabIndex={-1} className="shell-main flex-1 overflow-y-auto focus:outline-none">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:hidden v2:min-h-[52px] v2:gap-1 v2:px-1 v2:py-0">
          <button
            ref={menuButton}
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground v2:grid v2:h-11 v2:w-11 v2:place-items-center v2:p-0"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            aria-controls={SIDEBAR_ID}
          >
            <Menu className="h-5 w-5" />
          </button>
          <LogoMark />
          {isAdmin && (
            <button
              onClick={openCommandPalette}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground v2:grid v2:h-11 v2:w-11 v2:place-items-center v2:p-0"
              aria-label="Search and jump to anything"
            >
              <Search className="h-5 w-5" />
            </button>
          )}
        </div>

        <div
          data-width={width}
          className={cn(
            "shell-page mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8",
            // The page header reads this to bleed to the top (see globals.css, .shell-header).
            "[--shell-pt:1.5rem] md:[--shell-pt:2rem]",
            // New look, the page frame (page types v1): every width, "full" included, is one gutter on
            // each side, content at most --frame wide (set per width in globals.css), centred in the
            // main area. 40px from the top of the main area to the page's first line (24 on phones),
            // 96 after the last.
            "v2:mx-auto v2:max-w-[calc(var(--frame)+2*var(--gutter))] v2:px-[var(--gutter)] v2:pb-24 v2:pt-10 v2:[--shell-pt:40px] max-md:v2:pt-6 max-md:v2:[--shell-pt:24px]"
          )}
        >
          {/* The slim scroll bar's slot (CondensedBar): sticky, zero height, new look only. */}
          <div data-condensed-slot="" className="hidden v2:block" />
          {children}
        </div>
      </main>
    </div>
  );
}
