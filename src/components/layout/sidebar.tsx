"use client";

import Link from "next/link";
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
  ChevronRight,
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
} from "lucide-react";
import { CompanySwitcher } from "@/components/ui/company-switcher";
import { useCompany } from "@/context/company-context";

// Part 11, WS28 (Q33-B) — recurring actions first, setup-once items pushed down.
const founderNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Updates", href: "/updates", icon: FileText },
  { label: "Metrics", href: "/company/metrics", icon: BarChart3 },
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

// Dashboard sits ungrouped above the labeled clusters below (Q28-A).
const adminDashboardItem = { label: "Dashboard", href: "/admin", icon: LayoutDashboard };

// Part 11, WS28 — admin nav regrouped into three labeled clusters
// (Q28-A) after five parts of unrelated feature growth left this a flat,
// 13-14 item list with no grouping cue (see docs/IMPLEMENTATION_PLAN.md
// Part 11 findings). "Portfolio" -> "Deal Ledger" (Q29-B) is a copy-only
// rename; href unchanged. "Fund Reports" (Q31-A) is newly linked here —
// it previously had zero sidebar presence. Two items deliberately do NOT
// appear anywhere in this file: "Sync" (Q30-B) is a genuinely global
// integration (one spreadsheet, every fund), so it's a tab on
// /admin/funds; "Update Templates" is a sub-feature of Updates (the
// skeletons founders start an update from, not a peer destination), so
// it's a tab on /admin/updates (see src/components/admin/*-panel.tsx).
const adminNavGroups = [
  {
    label: "Company Operations",
    items: [
      { label: "Approvals", href: "/admin/approvals", icon: Shield },
      { label: "Diligence", href: "/admin/diligence", icon: ClipboardCheck },
      { label: "Companies", href: "/admin/companies", icon: Building2 },
      { label: "Updates", href: "/admin/updates", icon: FileText },
      { label: "Investor Links", href: "/admin/links", icon: Link2 },
    ],
  },
  {
    label: "Funds & LPs",
    items: [
      { label: "Funds", href: "/admin/funds", icon: Landmark },
      { label: "Deal Ledger", href: "/admin/portfolio", icon: Rows3 },
      { label: "LPs", href: "/admin/lps", icon: Handshake },
      { label: "Fund Reports", href: "/admin/reports", icon: NotebookPen },
    ],
  },
  {
    label: "Admin Tools",
    items: [
      { label: "Weekly Digest", href: "/admin/digest", icon: BookOpen },
      { label: "Service Providers", href: "/admin/providers", icon: Wrench },
      { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

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

  function isActive(href: string) {
    return href === "/admin" || href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
  }

  function renderItem(item: { label: string; href: string; icon: typeof LayoutDashboard }) {
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onClose}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-primary-50 text-primary-600"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
          {active && <ChevronRight className="ml-auto h-4 w-4" />}
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
            <ul className="space-y-1">{renderItem(adminDashboardItem)}</ul>
            {adminNavGroups.map((group, i) => {
              const headingId = `sidebar-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
              const groupActive = group.items.some((item) => isActive(item.href));
              return (
                <div
                  key={group.label}
                  role="group"
                  aria-labelledby={headingId}
                  className={cn(i === 0 ? "mt-6" : "mt-4", i > 0 && "border-t border-border pt-4")}
                >
                  <p
                    id={headingId}
                    className={cn(
                      "mb-1.5 px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em]",
                      groupActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {group.label}
                  </p>
                  <ul className="space-y-1">{group.items.map(renderItem)}</ul>
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
