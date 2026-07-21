import { redirect } from "next/navigation";

// Templates moved off its own sidebar item/page onto a "Templates" tab on
// /admin/updates — it's a sub-feature of Updates (the skeletons founders
// start an update from), not a peer-level nav destination. See
// src/components/admin/templates-panel.tsx. This redirect keeps any
// existing bookmarks/links to /admin/templates working.
export default function AdminTemplatesRedirectPage() {
  redirect("/admin/updates?tab=templates");
}
