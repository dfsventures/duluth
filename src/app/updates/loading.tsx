import { AppShell } from "@/components/layout/app-shell";
import { PageSkeleton } from "@/components/ui/skeleton";

// Route-segment loading UI: shows the shell and a skeleton immediately on
// navigation instead of a blank screen (UI overhaul phase 2, spec 6.6).
export default function Loading() {
  return (
    <AppShell>
      <PageSkeleton />
    </AppShell>
  );
}
