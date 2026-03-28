"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  FileText,
  BarChart3,
  Bot,
  LogOut,
  ChevronRight,
  Shield,
  Link2,
  Settings,
  Users,
  BookOpen,
} from "lucide-react";

const founderNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Company Profile", href: "/company/profile", icon: Building2 },
  { label: "Metrics", href: "/company/metrics", icon: BarChart3 },
  { label: "Updates", href: "/updates/new", icon: FileText },
  { label: "Investor Links", href: "/links", icon: Link2 },
  { label: "Team", href: "/team", icon: Users },
];

const adminNav = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Approvals", href: "/admin/approvals", icon: Shield },
  { label: "Companies", href: "/admin/companies", icon: Building2 },
  { label: "Investor Links", href: "/admin/links", icon: Link2 },
  { label: "Weekly Digest", href: "/admin/digest", icon: BookOpen },
  { label: "AI Chat", href: "/admin/chat", icon: Bot },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();

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
  const nav = useAdminNav ? adminNav : founderNav;

  return (
    <aside
      className={cn(
        "flex h-screen w-60 shrink-0 flex-col border-r bg-white",
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
          <img src="/logo.png" alt="Molly" className="h-8" />
          <span className="font-semibold text-foreground">Molly</span>
        </Link>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {nav.map((item) => {
            const isActive =
              item.href === "/admin" || item.href === "/dashboard"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-50 text-primary-600"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
            {session?.user?.name?.[0]?.toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{session?.user?.name || session?.user?.email}</p>
            <p className="truncate text-xs text-muted-foreground">
              {isAdmin && isFounder ? "Admin & Founder" : isAdmin ? "Admin" : "Founder"}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
