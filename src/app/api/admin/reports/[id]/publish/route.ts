export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { extractMentionIds, buildMentionSnapshot } from "@/lib/report-snapshot";
import { sendLpReportPublishedEmail } from "@/lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const notify = body?.notify === true;

    const report = await db.fundReport.findUnique({ where: { id }, include: { fund: { select: { name: true } } } });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    if (report.status !== "DRAFT") {
      return NextResponse.json({ error: "Only a draft report can be published." }, { status: 400 });
    }

    const mentionedIds = extractMentionIds(report.body);

    // JC6: a mention is only meaningful if the company has at least one deal
    // in THIS report's fund — otherwise the hover card would have no numbers.
    const mentionedCompanies = await db.portfolioCompany.findMany({
      where: { id: { in: mentionedIds } },
      include: { deals: { where: { fundId: report.fundId } } },
    });
    const byId = new Map(mentionedCompanies.map((c) => [c.id, c]));
    const offenders = mentionedIds.filter((mid) => !byId.get(mid) || byId.get(mid)!.deals.length === 0);
    if (offenders.length > 0) {
      const names = offenders.map((oid) => byId.get(oid)?.name ?? oid);
      return NextResponse.json(
        { error: `These mentioned companies have no deal in this report's fund: ${names.join(", ")}` },
        { status: 400 }
      );
    }

    const published = await db.$transaction(async (tx) => {
      await tx.fundReportMention.deleteMany({ where: { reportId: id } });

      for (const mid of mentionedIds) {
        const company = byId.get(mid)!;
        const snapshot = buildMentionSnapshot(
          company.name,
          company.country,
          company.deals.map((d) => ({
            investmentType: d.investmentType,
            dealDate: d.dealDate,
            amountUsd: Number(d.amountUsd),
            entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
            currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
          }))
        );
        await tx.fundReportMention.create({
          data: {
            reportId: id,
            portfolioCompanyId: mid,
            companyName: company.name,
            snapshot: snapshot as unknown as object,
          },
        });
      }

      return tx.fundReport.update({
        where: { id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
    });

    // WS19 (Q7 = B): opt-in notification, off by default. Best-effort per
    // recipient — one bad address must never block the others or the
    // publish itself (the F12 lesson).
    let notifyResult: { notified: number; failed: number } | undefined;
    if (notify) {
      const memberships = await db.lpFundMembership.findMany({
        where: { fundId: report.fundId },
        include: { lp: { select: { email: true, name: true } } },
      });
      let notified = 0;
      let failed = 0;
      for (const m of memberships) {
        try {
          await sendLpReportPublishedEmail({
            email: m.lp.email,
            lpName: m.lp.name,
            fundName: report.fund.name,
            reportTitle: report.title,
          });
          notified++;
        } catch (emailError) {
          console.error(`Failed to send LP report-published email to ${m.lp.email}:`, emailError);
          failed++;
        }
      }
      notifyResult = { notified, failed };
    }

    await logAdminAction(user!, "REPORT_PUBLISHED", {
      targetType: "FundReport",
      targetId: id,
      metadata: { mentionCount: mentionedIds.length, notify, ...(notifyResult ? { notifyResult } : {}) },
    });
    return NextResponse.json({ ...published, notifyResult });
  } catch (err) {
    console.error("POST /api/admin/reports/[id]/publish error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
