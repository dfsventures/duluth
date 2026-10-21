import { useRouter } from "next/navigation";
import { NotebookText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Part 43: the two empty states of /admin/memos, shared by the list and the board. */
export function MemosEmpty({ filtered, scope, onClear }: { filtered: boolean; scope: string; onClear: () => void }) {
  const router = useRouter();
  if (filtered) {
    return (
      <EmptyState
        title="No memos match those filters"
        description="Try a different company, stage or memo status, or clear the filters."
        action={
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<NotebookText className="h-8 w-8" />}
      eyebrow="Memos"
      title={scope === "team" ? "Nothing shared yet" : "No memos yet"}
      description={
        scope === "team"
          ? "Memos appear here when their owner shares them with the team."
          : "Start one from the house template, or ask Marge to draft it from your call notes."
      }
      action={
        <Button onClick={() => router.push("/admin/memos/new")}>
          <Plus className="h-4 w-4" />
          New memo
        </Button>
      }
    />
  );
}
