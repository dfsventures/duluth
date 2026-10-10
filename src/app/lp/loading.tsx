import { PageSkeleton } from "@/components/ui/skeleton";

// LP portal keeps its own minimal chrome (lp/layout.tsx), so only the content
// area needs a skeleton (UI overhaul phase 2, spec 6.6).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageSkeleton />
    </div>
  );
}
