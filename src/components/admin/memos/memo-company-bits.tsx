import Link from "next/link";
import { Building2, Link2Off } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MemoCompanyRef } from "@/components/admin/memos/types";

const ICON_LINK = "inline-flex items-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The four states (Part 42). Badges are screen-only; print shows the name. */
export function companyLineNode(ref: MemoCompanyRef) {
  return ref.kind === "company" ? (
    <Link href={`/admin/companies/${ref.id}`} className="text-primary underline-offset-4 hover:underline">
      {ref.name}
    </Link>
  ) : ref.kind === "ledger" ? (
    <span className="inline-flex items-center gap-2">
      <Link href={`/admin/portfolio/${ref.id}`} className="text-primary underline-offset-4 hover:underline">
        {ref.name}
      </Link>
      <Badge variant="neutral" className="memo-no-print">
        Deal Ledger
      </Badge>
    </span>
  ) : ref.kind === "pending" ? (
    <span className="inline-flex items-center gap-2">
      <span className="text-foreground">{ref.name}</span>
      <Badge variant="neutral" className="memo-no-print">
        Not linked
      </Badge>
    </span>
  ) : null;
}

/** JC-MP-G: when the name repeats the title, a quiet icon keeps the company reachable. */
export function companyIconNode(ref: MemoCompanyRef) {
  return ref.kind === "company" ? (
    <Link href={`/admin/companies/${ref.id}`} aria-label={`Open ${ref.name} in Molly`} title={`Open ${ref.name} in Molly`} className={ICON_LINK}>
      <Building2 aria-hidden className="h-4 w-4" />
    </Link>
  ) : ref.kind === "ledger" ? (
    <Link href={`/admin/portfolio/${ref.id}`} aria-label={`Open ${ref.name} in the Deal Ledger`} title={`Open ${ref.name} in the Deal Ledger`} className={ICON_LINK}>
      <Building2 aria-hidden className="h-4 w-4" />
    </Link>
  ) : ref.kind === "pending" ? (
    <span title="Not linked" className="inline-flex items-center text-muted-foreground">
      <Link2Off aria-hidden className="h-4 w-4" />
      <span className="sr-only">Not linked</span>
    </span>
  ) : null;
}
