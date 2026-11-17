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
import { surfaceForPath } from "@/lib/surface";
import { cn } from "@/lib/utils";

export const MAIN_ID = "main-content";

interface AppShellProps {
  children: React.ReactNode;
  /**
   * "page" (default) is today's centred column. "full" is for pages that lay out their own
   * list and pane (PLAN-1, WS160): under the new look it drops the column and the padding.
   * Under the old look both are the same box, so a page can pass "full" before it is ready.
   */
  width?: "page" | "full";
}

export function AppShell({ children, width = "page" }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  // Direction B applies to founder-facing surfaces only; admin keeps Direction A+.
  const surface = surfaceForPath(usePathname());
  // The palette and shortcuts are admin only in v1 (spec decision 3).
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes("ADMIN") ?? false;

  // Phone drawer: Esc closes it, focus moves into it on open and back to the
  // menu button on close, so keyboard and screen reader users are not stranded.
  useEffect(() => {
    if (!sidebarOpen) return;
    const button = menuButton.current;
    document.getElementById(SIDEBAR_ID)?.querySelector<HTMLElement>("a[href], button")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [sidebarOpen]);

  return (
    // h-dvh, not h-screen — see the note in sidebar.tsx
    <div className="flex h-dvh overflow-hidden" data-surface={surface}>
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

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
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
            // "full": no column and no padding under the new look; the page lays itself out.
            width === "full"
              ? "v2:max-w-none v2:p-0 v2:[--shell-pt:0px]"
              : // New look: left-aligned, one gutter from the sidebar, content at most --column wide.
                "v2:mx-0 v2:max-w-[calc(var(--column)+2*var(--gutter))] v2:px-[var(--gutter)]"
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
