import { redirect } from "next/navigation";

// Part 11, WS28 (Q30-B) — Sync moved off its own sidebar item and page.
// Sync is a genuinely global integration (see src/components/admin/
// sync-panel.tsx for the full reasoning), so it now lives as a "Sync" tab
// on /admin/funds instead. This redirect keeps any existing bookmarks/
// links to /admin/sync working.
export default function AdminSyncRedirectPage() {
  redirect("/admin/funds?tab=sync");
}
