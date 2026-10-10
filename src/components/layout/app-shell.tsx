"use client";

import { useState } from "react";
import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar } from "./sidebar";
import { LogoMark } from "@/components/ui/logo-mark";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { Shortcuts } from "./shortcuts";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Direction A+: admin stays square, founder-facing surfaces get a 4px card radius.
  const surface = usePathname()?.startsWith("/admin") ? "admin" : "founder";
  // The palette and shortcuts are admin only in v1 (spec decision 3).
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes("ADMIN") ?? false;

  return (
    // h-dvh, not h-screen — see the note in sidebar.tsx
    <div className="flex h-dvh overflow-hidden" data-surface={surface}>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-obsidian/35 md:hidden"
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

      <main className="flex-1 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <LogoMark className="text-lg" />
          {isAdmin && (
            <button
              onClick={openCommandPalette}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Search and jump to anything"
            >
              <Search className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}
