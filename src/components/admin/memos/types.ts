// Part 40 (WS127). Shapes the memo pages pass between server and client. Dates are ISO strings.
import type { CitationKind, MemoCitation, MemoCompanyRef, MemoDecision, MemoIntroCall, MemoStatus } from "@/lib/memos";

export type { MemoCitation, MemoCompanyRef, MemoDecision, MemoIntroCall, MemoStatus, CitationKind };

export interface CompanyOption {
  id: string;
  name: string;
  kind: "company" | "ledger";
}

/** Part 42: what a memo can link to. Ledger rows here have no Molly Company of their own. */
export interface LinkTargets {
  companies: CompanyOption[];
  ledger: CompanyOption[];
}

/** Picker values: "c:<id>" for a Company, "p:<id>" for a deal-ledger row. */
export const targetValue = (o: { kind: "company" | "ledger"; id: string }) => `${o.kind === "company" ? "c" : "p"}:${o.id}`;
export const refValue = (r: MemoCompanyRef) => (r.kind === "company" || r.kind === "ledger" ? targetValue(r) : "");

export interface MemoRow {
  id: string;
  title: string;
  companyId: string | null;
  companyNamePending: string | null;
  status: MemoStatus;
  visibility: "PRIVATE" | "TEAM";
  draftedByMarge: boolean;
  decision: MemoDecision | null;
  version: number;
  updatedAt: string;
  company: { id: string; name: string } | null;
  companyRef: MemoCompanyRef;
  owner: { id: string; name: string | null; email: string };
}

export interface MemoSectionView {
  key: string;
  title: string;
  markdown: string;
  /** Sanitized HTML from renderMemoMarkdown (server side). */
  html: string;
  citations: MemoCitation[];
  includeInShare: boolean;
  version: number;
  /** Template guidance for this key, shown while the section is empty. */
  guidance: string | null;
}

export interface MemoView {
  id: string;
  title: string;
  status: MemoStatus;
  visibility: "PRIVATE" | "TEAM";
  draftedByMarge: boolean;
  importedFromNotion: boolean;
  decision: MemoDecision | null;
  source: string | null;
  tags: string[];
  introDate: string | null; // YYYY-MM-DD
  websiteUrl: string | null;
  introCalls: MemoIntroCall[];
  version: number;
  updatedAt: string;
  companyNamePending: string | null;
  company: { id: string; name: string } | null;
  companyRef: MemoCompanyRef;
  owner: { id: string; name: string | null; email: string };
  sections: MemoSectionView[];
  canEdit: boolean;
  canManage: boolean;
}

export interface RevisionView {
  version: number;
  title: string;
  markdown: string;
  citations: MemoCitation[];
  includeInShare: boolean;
  via: string | null;
  restoredFrom: number | null;
  createdAt: string;
  editedBy: { id: string; name: string | null; email: string };
}

export const STATUS_VARIANT = { DRAFT: "neutral", IN_REVIEW: "warning", FINAL: "success" } as const;

/** Date-only values are stored at 00:00 UTC; format them in UTC so they never slip a day. */
export function formatDateOnly(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const ownerLabel = (o: { name: string | null; email: string }) => o.name?.trim() || o.email;

/** Reads `{ error }` from a failed response; falls back to a plain sentence. */
export async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}
