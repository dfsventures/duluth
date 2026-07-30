export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { extractMentionIds } from "@/lib/report-snapshot";

export async function GET(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");

    const reports = await db.fundReport.findMany({
      where: fundId ? { fundId } : {},
      include: {
        fund: { select: { id: true, name: true, slug: true } },
        _count: { select: { mentions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      reports.map((r) => ({
        id: r.id,
        title: r.title,
        periodLabel: r.periodLabel,
        status: r.status,
        publishedAt: r.publishedAt,
        createdAt: r.createdAt,
        fund: r.fund,
        // FundReportMention rows only exist once a report has been
        // published (they're frozen at publish, per WS35/the older Q13
        // mention-freeze design). For any report currently in DRAFT —
        // whether it's never been published, or was unpublished-to-edit —
        // _count.mentions is stale or zero, so fall back to the same live
        // extractMentionIds() the editor's own "Mentioned companies" chip
        // strip already uses, keeping this count consistent with what an
        // admin sees on the report page itself.
        mentionCount: r.status === "PUBLISHED" ? r._count.mentions : extractMentionIds(r.body).length,
      }))
    );
  } catch (err) {
    console.error("GET /api/admin/reports error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { fundId } = body;
    const title = body.title?.trim();

    if (!fundId || !(await db.fund.findUnique({ where: { id: fundId } }))) {
      return NextResponse.json({ error: "A valid fundId is required." }, { status: 400 });
    }
    if (!title || title.length > 200) {
      return NextResponse.json({ error: "Title is required and must be 200 characters or fewer." }, { status: 400 });
    }

    const report = await db.fundReport.create({
      data: {
        fundId,
        title,
        periodLabel: body.periodLabel?.trim() || null,
        body: "",
        status: "DRAFT",
        createdById: user!.id,
      },
    });

    await logAdminAction(user!, "REPORT_CREATED", { targetType: "FundReport", targetId: report.id, metadata: { fundId, title } });
    return NextResponse.json(report, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/reports error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
