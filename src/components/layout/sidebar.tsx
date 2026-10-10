"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ui/logo-mark";
import {
  LayoutDashboard,
  Building2,
  FileText,
  BarChart3,
  LogOut,
  ChevronDown,
  Search,
  Shield,
  Link2,
  Settings,
  Users,
  BookOpen,
  Wrench,
  ScrollText,
  Landmark,
  Handshake,
  Rows3,
  NotebookPen,
  ClipboardCheck,
  FolderOpen,
  Calculator,
  Megaphone,
  Contact,
  KanbanSquare,
} from "lucide-react";
import { CompanySwitcher } from "@/components/ui/company-switcher";
import { useCompany } from "@/context/company-context";
import { ADMIN_DASHBOARD, ADMIN_NAV_GROUPS } from "@/lib/admin-nav";
import { openCommandPalette } from "./command-palette";

// Part 11, WS28 (Q33-B) — recurring actions first, setup-once items pushed down.
const founderNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Updates", href: "/updates", icon: FileText },
  { label: "Metrics", href: "/company/metrics", icon: BarChart3 },
  // Part 29, WS68 (JC-CT-C) — sits with Metrics in the analytical/modeling
  // cluster, not the "manage your records" cluster below. Deliberately
  // not called "Cap Table" — this is hypothetical, self-declared
  // modeling, not the founder's authoritative equity ledger.
  { label: "Dilution Planner", href: "/planner", icon: Calculator },
  { label: "Investor Links", href: "/links", icon: Link2 },
  { label: "Company Profile", href: "/company/profile", icon: Building2 },
  // Part 20, WS47 — sits with Company Profile in the "manage your
  // company's records" cluster, not with Team/Service Providers.
  // Ungated by stage (JC-FD-B) — matches the FolderOpen icon already
  // used for the equivalent admin Documents tab.
  { label: "Documents", href: "/company/documents", icon: FolderOpen },
  { label: "Team", href: "/team", icon: Users },
  { label: "Service Providers", href: "/providers", icon: Wrench },
];

// The admin nav itself (labels, hrefs, groups) is data in src/lib/admin-nav.ts,
// shared with the command palette and the `g` shortcuts. Only icons live here.
const ADMIN_ICONS: Record<string, typeof LayoutDashboard> = {
  "/admin": LayoutDashboard,
  "/admin/approvals": Shield,
  "/admin/diligence": ClipboardCheck,
  "/admin/companies": Building2,
  "/admin/updates": FileText,
  "/admin/links": Link2,
  "/admin/funds": Landmark,
  // Part 33, WS89 (D1): portfolio-WIDE contact + account-link management.
  "/admin/portfolio": Rows3,
  "/admin/portfolio-contacts": Contact,
  "/admin/lps": Handshake,
  "/admin/reports": NotebookPen,
  "/admin/broadcasts": Megaphone,
  "/admin/board": KanbanSquare,
  "/admin/digest": BookOpen,
  "/admin/providers": Wrench,
  "/admin/audit": ScrollText,
  "/admin/settings": Settings,
};

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const adminDashboardItem: NavItem = { ...ADMIN_DASHBOARD, icon: LayoutDashboard };
const adminNavGroups = ADMIN_NAV_GROUPS.map((g) => ({
  label: g.label,
  items: g.items.map((i): NavItem => ({ label: i.label, href: i.href, icon: ADMIN_ICONS[i.href] ?? FileText })),
}));

interface NavCounts {
  approvals: number;
  diligence: number;
  boardReview: number;
}

/**
 * Markers that say "this needs you". Approvals and Diligence are solid Obsidian
 * (someone is waiting); the board's review count is informational and stays quiet.
 */
function countMarker(href: string, counts: NavCounts | null): { text: string; solid: boolean; sr: string } | null {
  if (!counts) return null;
  if (href === "/admin/approvals" && counts.approvals > 0)
    return { text: String(counts.approvals), solid: true, sr: `${counts.approvals} waiting` };
  if (href === "/admin/diligence" && counts.diligence > 0)
    return { text: String(counts.diligence), solid: true, sr: `${counts.diligence} ready for review` };
  if (href === "/admin/board" && counts.boardReview > 0)
    return { text: `${counts.boardReview} to review`, solid: false, sr: `${counts.boardReview} to review` };
  return null;
}

const COLLAPSE_KEY = "molly.nav.collapsed";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { selectedCompany } = useCompany();

  const isAdminPath = pathname.startsWith("/admin");
  const isAdmin =
    status === "authenticated"
      ? (session?.user?.roles?.includes("ADMIN") ?? false)
      : isAdminPath;
  const isFounder =
    status === "authenticated"
      ? (session?.user?.roles?.includes("FOUNDER") ?? false)
      : !isAdminPath;

  // Dual-role users see admin nav on /admin paths, founder nav everywhere else
  const useAdminNav = isAdminPath || (isAdmin && !isFounder);

  // Sidebar markers (admin nav only). Silent on failure: the nav works without them.
  const [counts, setCounts] = useState<NavCounts | null>(null);
  useEffect(() => {
    if (!useAdminNav || !isAdmin) return;
    let cancelled = false;
    fetch("/api/admin/nav-counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setCounts(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Refetch on navigation so a number drops after you clear the queue.
  }, [useAdminNav, isAdmin, pathname]);

  // Collapsed groups are remembered per browser. Storage can throw (private
  // windows, blocked site data), so every access is guarded.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCollapsed(parsed.filter((x): x is string => typeof x === "string"));
      }
    } catch {
      /* default: all open */
    }
  }, []);
  function toggleGroup(label: string) {
    setCollapsed((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* not persisted */
      }
      return next;
    });
  }

  function isActive(href: string) {
    return href === "/admin" || href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href);
    const marker = useAdminNav ? countMarker(item.href, counts) : null;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onClose}
          aria-current={active ? "page" : undefined}
          className={cn(
            // Active: a white tab with a 2px Sky rule on its left edge.
            "relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-card text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-sky"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <item.icon aria-hidden="true" className="h-4 w-4" />
          {item.label}
          {marker && (
            <span
              className={cn(
                "num ml-auto font-mono text-label",
                marker.solid ? "bg-foreground px-1.5 text-background" : "text-muted-foreground"
              )}
            >
              <span aria-hidden="true">{marker.text}</span>
              <span className="sr-only">, {marker.sr}</span>
            </span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <aside
      className={cn(
        // h-dvh, not h-screen: 100vh includes the area behind mobile browser
        // bars, which clipped the bottom-pinned user/logout row under
        // Chrome's address bar. dvh tracks the actual visible viewport.
        "flex h-dvh w-60 shrink-0 flex-col border-r border-border bg-background",
        // Mobile: fixed overlay, toggled via open prop
        "fixed inset-y-0 left-0 z-40 transition-transform duration-200",
        open ? "translate-x-0" : "-translate-x-full",
        // Desktop: always visible, static position
        "md:relative md:translate-x-0"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-5">
        <Link href={useAdminNav ? "/admin" : "/dashboard"} className="flex items-center gap-2">
          <LogoMark className="text-lg" />
        </Link>
      </div>

      {/* Company switcher — founder only, hidden when single company */}
      {!useAdminNav && <CompanySwitcher />}

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {useAdminNav ? (
          <>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  openCommandPalette();
                }}
                className="mb-3 flex w-full items-center gap-2 border border-border bg-card px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-[var(--color-border-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="flex-1">Search or jump to</span>
                <kbd className="border border-border bg-background px-1.5 font-mono text-[10px]">Ctrl K</kbd>
              </button>
            )}
            <ul className="space-y-1">{renderItem(adminDashboardItem)}</ul>
            {adminNavGroups.map((group, i) => {
              const headingId = `sidebar-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
              const listId = `${headingId}-list`;
              const groupActive = group.items.some((item) => isActive(item.href));
              // A group holding the current page never hides it.
              const isOpen = groupActive || !collapsed.includes(group.label);
              return (
                <div
                  key={group.label}
                  role="group"
                  aria-labelledby={headingId}
                  className={cn(i === 0 ? "mt-6" : "mt-4", i > 0 && "border-t border-border pt-4")}
                >
                  <button
                    type="button"
                    id={headingId}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    onClick={() => toggleGroup(group.label)}
                    className={cn(
                      "mb-1.5 flex w-full items-center justify-between px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      groupActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {group.label}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("h-3.5 w-3.5 transition-transform", !isOpen && "-rotate-90")}
                    />
                  </button>
                  <ul id={listId} hidden={!isOpen} className="space-y-1">
                    {group.items.map(renderItem)}
                  </ul>
                </div>
              );
            })}
          </>
        ) : (
          <ul className="space-y-1">
            {/* Part 16, WS40 — surfaced right under Dashboard, only
                while the founder's selected company is still in
                due-diligence intake. */}
            {renderItem(founderNav[0])}
            {selectedCompany?.stage === "DILIGENCE" &&
              renderItem({ label: "Diligence", href: "/diligence", icon: ClipboardCheck })}
            {founderNav.slice(1).map(renderItem)}
          </ul>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-semibold font-mono">
            {session?.user?.name?.[0]?.toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{session?.user?.name || session?.user?.email}</p>
            <p className="truncate text-xs text-muted-foreground">
              {isAdmin && isFounder ? "Admin & Founder" : isAdmin ? "Admin" : "Founder"}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
