import { Badge } from "@/components/ui/badge";
import type { MemoRow } from "@/components/admin/memos/types";

/** Part 43 (JC-MB-H): the list's Company cell body, shared so the list and the board cannot drift. */
export function MemoCompanyLabel({ companyRef, noneLabel = "None", badge = true }: { companyRef: MemoRow["companyRef"]; noneLabel?: string; badge?: boolean }) {
  if (companyRef.kind === "company" || companyRef.kind === "ledger") return <>{companyRef.name}</>;
  if (companyRef.kind === "pending") {
    if (!badge) return <>{companyRef.name}</>;
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {companyRef.name}
        <Badge variant="neutral">Not linked</Badge>
      </span>
    );
  }
  return <span className="text-muted-foreground">{noneLabel}</span>;
}
