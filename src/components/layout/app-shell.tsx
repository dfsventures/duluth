"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Image from "next/image";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/logo.png" alt="Molly" width={24} height={24} />
          <span className="font-semibold text-foreground">Molly</span>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}
