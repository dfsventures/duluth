import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentTemplate } from "@/lib/memo-template";
import { renderMemoMarkdown } from "@/lib/memo-render";
import { canEditMemo, canManageMemo, memoCompanyFilter, memoVisibleWhere, readCitations, readIntroCalls } from "@/lib/memos";
import type { MemoDecision, MemoStatus, MemoView } from "@/components/admin/memos/types";
import MemoClient from "./memo-client";

export const dynamic = "force-dynamic";

// Server page: notFound() unless the signed-in admin may read this memo (memoVisibleWhere), so a
// private memo of someone else is indistinguishable from one that doesn't exist. The markdown is
// rendered to sanitized HTML here, so the client never renders markdown itself.
export default async function MemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN") || session.user.status !== "APPROVED") redirect("/login");
  const userId = session.user.id;

  const memo = await db.memo.findFirst({
    where: { id, ...memoVisibleWhere(userId) },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true } },
      sections: { orderBy: { position: "asc" } },
    },
  });
  if (!memo) notFound();

  const [template, companies] = await Promise.all([
    currentTemplate(),
    db.company.findMany({ where: memoCompanyFilter, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const guidance = new Map(template.sections.map((s) => [s.key, s.guidance]));

  const view: MemoView = {
    id: memo.id,
    title: memo.title,
    status: memo.status as MemoStatus,
    visibility: memo.visibility as "PRIVATE" | "TEAM",
    draftedByMarge: memo.draftedByMarge,
    importedFromNotion: memo.notionId !== null,
    decision: memo.decision as MemoDecision | null,
    source: memo.source,
    tags: memo.tags,
    introDate: memo.introDate ? memo.introDate.toISOString().slice(0, 10) : null,
    websiteUrl: memo.websiteUrl,
    introCalls: readIntroCalls(memo.introCalls),
    version: memo.version,
    updatedAt: memo.updatedAt.toISOString(),
    companyNamePending: memo.companyNamePending,
    company: memo.company,
    owner: memo.owner,
    canEdit: canEditMemo(memo, userId),
    canManage: canManageMemo(memo, userId),
    sections: memo.sections.map((s) => ({
      key: s.key,
      title: s.title,
      markdown: s.markdown,
      html: renderMemoMarkdown(s.markdown, { surface: "app" }),
      citations: readCitations(s.citations),
      includeInShare: s.includeInShare,
      version: s.version,
      guidance: guidance.get(s.key) ?? null,
    })),
  };

  return <MemoClient memo={view} companies={companies} />;
}
