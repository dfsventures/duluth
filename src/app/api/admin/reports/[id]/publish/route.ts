export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { extractMentionIds, buildMentionSnapshot, hasFundSnapshotMarker } from "@/lib/report-snapshot";
import { buildFundReportSnapshot } from "@/lib/portfolio-metrics";
import { sendLpReportPublishedEmail } from "@/lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const notify = body?.notify === true;

    // WS54: optional per-publish note, only ever sent when notify is true, but
    // validated unconditionally so a >500-char note is never silently dropped.
    const noteRaw = typeof body?.note === "string" ? body.note.trim() : "";
    if (noteRaw.length > 500) {
      return NextResponse.json({ error: "Note must be 500 characters or fewer." }, { status: 400 });
    }
    const note = noteRaw || null;

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
      // F24: a mention span can point at a company deleted since the draft was
      // written (only reachable for zero-deal companies — see F23's delete
      // guard). Say so honestly instead of leaking the raw cuid.
      const names = offenders.map((oid) => byId.get(oid)?.name ?? "a company that no longer exists");
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

      // Part 14, WS35.1 — fund-performance snapshot: a second, independent
      // freeze living alongside the mention freeze above, same
      // delete-and-recreate-on-every-publish semantics (Q44-A). Always
      // deletes first (handles "marker removed before republish" the same
      // way mentions already do above), and always keys off report.fundId
      // — NEVER a client-suppliable fund id (ground rule 1) — closing the
      // "could this ever freeze a different fund's numbers into this
      // report" question structurally.
      await tx.fundReportFundSnapshot.deleteMany({ where: { reportId: id } });
      if (hasFundSnapshotMarker(report.body)) {
        const fund = await tx.fund.findUnique({
          where: { id: report.fundId },
          include: { deals: { include: { portfolioCompany: { select: { name: true } } } }, cashflows: true },
        });
        if (fund) {
          const snapshot = buildFundReportSnapshot(
            fund.name,
            fund.deals.map((d) => ({
              companyName: d.portfolioCompany.name,
              investmentType: d.investmentType,
              dealDate: d.dealDate,
              amountUsd: Number(d.amountUsd),
              instrument: d.instrument,
              entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
              currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
              ownershipPct: d.ownershipPct !== null ? Number(d.ownershipPct) : null,
              valuationAsOf: d.valuationAsOf,
            })),
            fund.cashflows.map((c) => ({ kind: c.kind, date: c.date, amountUsd: Number(c.amountUsd) })),
            // Part 15, WS37.6 — manual performance override (Q46-Q52),
            // already present on `fund` since the findUnique above has no
            // `select`.
            {
              grossMoic: fund.grossMoicOverride !== null ? Number(fund.grossMoicOverride) : null,
              netTvpi: fund.netTvpiOverride !== null ? Number(fund.netTvpiOverride) : null,
              netDpi: fund.netDpiOverride !== null ? Number(fund.netDpiOverride) : null,
            }
          );
          await tx.fundReportFundSnapshot.create({
            data: { reportId: id, fundId: report.fundId, fundName: fund.name, snapshot: snapshot as unknown as object },
          });
        }
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
            note, // WS54
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
      metadata: {
        mentionCount: mentionedIds.length,
        notify,
        noteIncluded: note !== null,
        ...(note ? { note } : {}),
        ...(notifyResult ? { notifyResult } : {}),
      },
    });
    return NextResponse.json({ ...published, notifyResult });
  } catch (err) {
    console.error("POST /api/admin/reports/[id]/publish error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
