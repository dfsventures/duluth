export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { MEMO_MESSAGES, suggestCompany } from "@/lib/memo-actions";
import { memoVisibleWhere } from "@/lib/memos";

// "Acme is now in Molly. Link it?": at most one strong match for the memo's pending name, a Company ({ id, name })
// or a deal-ledger row ({ id, name, kind: "ledger" }).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    const memo = await db.memo.findFirst({
      where: { id, ...memoVisibleWhere(user!.id) },
      select: { companyId: true, portfolioCompanyId: true, companyNamePending: true },
    });
    if (!memo) return NextResponse.json({ error: MEMO_MESSAGES.notFound }, { status: 404 });
    if (memo.companyId || memo.portfolioCompanyId || !memo.companyNamePending) return NextResponse.json({ suggestion: null });
    return NextResponse.json({ suggestion: await suggestCompany(memo.companyNamePending) });
  } catch (err) {
    console.error("GET /api/admin/memos/[id]/company-suggestion error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
