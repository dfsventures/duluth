"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher, NAV_COUNTS_KEY } from "@/lib/fetcher";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/use-look";
import { usePaletteKey } from "@/lib/use-palette-key";
import { LogoMark } from "@/components/ui/logo-mark";
import {
  LayoutDashboard,
  Building2,
  FileText,
  BarChart3,
  LogOut,
  ChevronDown,
  Search,
  Moon,
  Sun,
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
  NotebookText,
} from "lucide-react";
import { CompanySwitcher } from "@/components/ui/company-switcher";
import { useCompany } from "@/context/company-context";
import { ADMIN_DASHBOARD, ADMIN_NAV_GROUPS } from "@/lib/admin-nav";
import { openCommandPalette } from "./command-palette";

// Part 11, WS28 (Q33-B) — recurring actions first, setup-once items pushed down.
const founderNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Updates", href: "/updates", icon: FileText },
  // Read-only view of DFS broadcasts targeted at the selected company.
  { label: "From DFS", href: "/from-dfs", icon: Megaphone },
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
  "/admin/memos": NotebookText,
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
  /** Name under the new look. Both are in the page and CSS shows one, so there is no flash on load. */
  labelV2?: string;
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

/** The sidebar's element id, so the phone menu button can point at it (aria-controls) and focus it. */
export const SIDEBAR_ID = "app-sidebar";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  /** The surface the shell is on, when it differs from what the path gives (AppShell's override). */
  surface?: "founder" | "admin";
}

export function Sidebar({ open = false, onClose, surface }: SidebarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { selectedCompany } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const paletteKey = usePaletteKey();

  const isAdminPath = pathname.startsWith("/admin");
  // The theme switch belongs to the admin surface: an /admin path, or a shared page that the shell has
  // put on the admin surface for an admin.
  const onAdminSurface = isAdminPath || surface === "admin";
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
  // SWR key shared with the admin dashboard, so one fetch feeds both and an
  // approve / dismiss elsewhere can refresh it via mutate(NAV_COUNTS_KEY).
  const wantsCounts = useAdminNav && isAdmin;
  const { data: countsData, mutate: refreshCounts } = useSWR<NavCounts>(wantsCounts ? NAV_COUNTS_KEY : null, fetcher, {
    keepPreviousData: true,
    shouldRetryOnError: false,
  });
  const counts = countsData ?? null;
  useEffect(() => {
    // Refetch on navigation so a number drops after you clear the queue.
    if (wantsCounts) void refreshCounts();
  }, [wantsCounts, pathname, refreshCounts]);

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
            "nav-item relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-card text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-mark"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            // New look: 32px items (44px on phones), 13px, the current page is a tint with
            // no left rule, and the focus ring sits inside so it is never clipped.
            "v2:h-8 v2:gap-2 v2:rounded v2:px-3 v2:py-0 v2:text-row max-md:v2:h-11 motion-reduce:transition-none",
            active
              ? "v2:bg-sel v2:before:hidden"
              : "v2:font-normal v2:text-secondary v2:hover:bg-row-hover v2:hover:text-foreground"
          )}
        >
          <item.icon aria-hidden="true" className="h-4 w-4 v2:h-3.5 v2:w-3.5" />
          {item.labelV2 ? (
            <>
              <span className="v2:hidden">{item.label}</span>
              <span className="hidden v2:inline">{item.labelV2}</span>
            </>
          ) : (
            item.label
          )}
          {marker && (
            <span
              className={cn(
                "num ml-auto font-mono text-label",
                marker.solid ? "bg-foreground px-1.5 text-background" : "text-muted-foreground",
                // New look: counts are plain right-aligned figures. Only the "needs you"
                // ones (approvals, diligence) are bold; review counts stay quiet.
                "v2:bg-transparent v2:px-0 v2:font-sans v2:text-meta",
                marker.solid ? "v2:font-semibold v2:text-foreground" : "v2:font-normal v2:text-muted-foreground"
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
      id={SIDEBAR_ID}
      aria-label="Sidebar"
      className={cn(
        // h-dvh, not h-screen: 100vh includes the area behind mobile browser
        // bars, which clipped the bottom-pinned user/logout row under
        // Chrome's address bar. dvh tracks the actual visible viewport.
        "app-sidebar flex h-dvh w-60 shrink-0 flex-col border-r border-border bg-background",
        // Mobile: fixed overlay, toggled via open prop
        "fixed inset-y-0 left-0 z-40 transition-transform duration-200",
        open ? "translate-x-0" : "-translate-x-full",
        // Desktop: always visible, static position
        "md:relative md:translate-x-0",
        // New look: 224px on the sidebar tier; a 292px drawer on phones that is
        // out of the tab order while closed (visibility waits for the slide).
        "v2:w-56 v2:bg-[var(--color-sidebar)] max-md:v2:w-[292px] max-md:v2:max-w-[85vw] motion-reduce:transition-none",
        !open && "max-md:v2:invisible max-md:v2:transition-[transform,visibility]"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-5 v2:h-[52px] v2:border-b-0 v2:px-6">
        <Link href={useAdminNav ? "/admin" : "/dashboard"} className="flex items-center gap-2" aria-label="Molly home">
          <LogoMark className="v2:h-4 v2:w-auto" />
        </Link>
      </div>

      {/* Company switcher — founder only, hidden when single company */}
      {!useAdminNav && <CompanySwitcher />}

      {/* Nav links */}
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4 v2:px-3 v2:pb-2 v2:pt-0">
        {useAdminNav ? (
          <>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  openCommandPalette();
                }}
                className="mb-3 flex w-full items-center gap-2 border border-border bg-card px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-[var(--color-border-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring v2:mb-4 v2:mt-1 v2:h-9 v2:rounded v2:border-[var(--color-border-hover)] v2:bg-background v2:px-3 v2:py-0 v2:text-row v2:text-secondary max-md:v2:h-11"
              >
                <Search aria-hidden="true" className="h-3.5 w-3.5" />
                {/* One line at any zoom: the label gives way (ellipsis), the key never does. */}
                <span className="min-w-0 flex-1 truncate">Search or jump to</span>
                <kbd className="shrink-0 whitespace-nowrap border border-border bg-background px-1.5 font-mono text-[10px] v2:rounded-sm v2:border-[var(--color-border-hover)] v2:bg-transparent v2:text-[11px] v2:text-muted-foreground">
                  {paletteKey}
                </kbd>
              </button>
            )}
            <ul className="space-y-1 v2:space-y-0">{renderItem(adminDashboardItem)}</ul>
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
                  className={cn(
                    i === 0 ? "mt-6" : "mt-4",
                    i > 0 && "border-t border-border pt-4",
                    "v2:mt-0 v2:border-t-0 v2:pt-0"
                  )}
                >
                  <button
                    type="button"
                    id={headingId}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    onClick={() => toggleGroup(group.label)}
                    className={cn(
                      "mb-1.5 flex w-full items-center justify-between px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      groupActive ? "text-foreground" : "text-muted-foreground",
                      // New look: sentence-case 12px heading in the sans, not mono caps.
                      "v2:mb-0 v2:px-3 v2:pb-1 v2:pt-6 v2:font-sans v2:text-meta v2:font-medium v2:normal-case v2:tracking-normal v2:text-muted-foreground max-md:v2:min-h-11 max-md:v2:py-0",
                      "motion-reduce:transition-none"
                    )}
                  >
                    {group.label}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("h-3.5 w-3.5 transition-transform", !isOpen && "-rotate-90")}
                    />
                  </button>
                  <ul id={listId} hidden={!isOpen} className="space-y-1 v2:space-y-0">
                    {group.items.map(renderItem)}
                  </ul>
                </div>
              );
            })}
          </>
        ) : (
          <ul className="space-y-1 v2:space-y-0 v2:pt-1">
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
      <div className="flex flex-col border-t p-4 v2:p-3">
        <div className="flex items-center gap-3 v2:order-1 v2:h-9 v2:gap-2 v2:pl-2 v2:pr-1 max-md:v2:h-11">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-semibold font-mono v2:h-6 v2:w-6 v2:font-sans v2:text-meta">
            {session?.user?.name?.[0]?.toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground v2:text-row">{session?.user?.name || session?.user?.email}</p>
            <p className="truncate text-xs text-muted-foreground v2:sr-only">
              {isAdmin && isFounder ? "Admin & Founder" : isAdmin ? "Admin" : "Founder"}
            </p>
          </div>
          {/* Light / dark: new look only (the old look has one theme). Also in the palette. */}
          {onAdminSurface && isAdmin && (
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="hidden h-7 w-7 place-items-center rounded text-muted-foreground transition-colors v2:grid v2:h-8 v2:w-8 v2:hover:bg-row-hover v2:hover:text-foreground max-md:v2:h-11 max-md:v2:w-11"
            >
              <Moon aria-hidden="true" className="h-4 w-4 v2dark:hidden" />
              <Sun aria-hidden="true" className="hidden h-4 w-4 v2dark:block" />
            </button>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors v2:grid v2:h-8 v2:w-8 v2:place-items-center v2:p-0 v2:hover:bg-row-hover max-md:v2:h-11 max-md:v2:w-11"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
