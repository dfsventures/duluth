export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { createMemo } from "@/lib/memo-actions";
import { memoResponse, memoSummarySelect, readObjectBody } from "@/lib/memo-route";
import { MEMO_DECISIONS, MEMO_STATUSES, memoVisibleWhere } from "@/lib/memos";

// GET: every memo the signed-in admin may read, with filters. POST: create from the template.
export async function GET(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const sp = new URL(request.url).searchParams;
    const scope = sp.get("scope");
    const and: Prisma.MemoWhereInput[] = [memoVisibleWhere(user!.id)];
    if (scope === "mine") and.push({ ownerId: user!.id });
    else if (scope === "team") and.push({ visibility: "TEAM" });
    const companyId = sp.get("companyId");
    if (companyId) and.push({ companyId });
    const status = sp.get("status");
    if (status && (MEMO_STATUSES as readonly string[]).includes(status)) and.push({ status });
    const decision = sp.get("decision");
    if (decision && (MEMO_DECISIONS as readonly string[]).includes(decision)) and.push({ decision });
    if (sp.get("unlinked") === "true") and.push({ companyId: null });
    const q = sp.get("q")?.trim().slice(0, 100);
    if (q) {
      and.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { companyNamePending: { contains: q, mode: "insensitive" } },
          { company: { name: { contains: q, mode: "insensitive" } } },
        ],
      });
    }

    const memos = await db.memo.findMany({
      where: { AND: and },
      select: memoSummarySelect,
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return NextResponse.json(memos);
  } catch (err) {
    console.error("GET /api/admin/memos error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    // Web creation always starts from the template: `sections` and `idempotencyKey` are Marge's.
    const { sections: _s, idempotencyKey: _k, ...web } = body;
    void _s;
    void _k;
    return memoResponse(await createMemo(user!, web), 201);
  } catch (err) {
    console.error("POST /api/admin/memos error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
