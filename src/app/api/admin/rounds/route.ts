export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

const VALID_KINDS = ["PRICED", "SAFE", "CONVERSION", "OTHER", "UNKNOWN"];

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const portfolioCompanyId = body.portfolioCompanyId?.trim();
    if (!portfolioCompanyId) {
      return NextResponse.json({ error: "portfolioCompanyId is required." }, { status: 400 });
    }
    const company = await db.portfolioCompany.findUnique({ where: { id: portfolioCompanyId } });
    if (!company) return NextResponse.json({ error: "Portfolio company not found" }, { status: 404 });

    if (!body.roundDate) return NextResponse.json({ error: "roundDate is required." }, { status: 400 });
    const roundDate = new Date(body.roundDate);
    if (Number.isNaN(roundDate.getTime())) return NextResponse.json({ error: "Invalid roundDate." }, { status: 400 });

    const kind = body.kind ?? "UNKNOWN";
    if (!VALID_KINDS.includes(kind)) {
      return NextResponse.json({ error: `kind must be one of ${VALID_KINDS.join(", ")}.` }, { status: 400 });
    }

    const round = await db.financingRound.create({
      data: {
        portfolioCompanyId,
        label: body.label?.trim() || null,
        kind,
        roundDate,
        raisedUsd: body.raisedUsd === undefined || body.raisedUsd === null || body.raisedUsd === "" ? null : Number(body.raisedUsd),
        preMoneyUsd: body.preMoneyUsd === undefined || body.preMoneyUsd === null || body.preMoneyUsd === "" ? null : Number(body.preMoneyUsd),
        postMoneyUsd: body.postMoneyUsd === undefined || body.postMoneyUsd === null || body.postMoneyUsd === "" ? null : Number(body.postMoneyUsd),
        source: "MANUAL",
        notes: body.notes?.trim() || null,
      },
    });

    await logAdminAction(user!, "ROUND_CREATED", { targetType: "FinancingRound", targetId: round.id, metadata: { portfolioCompanyId, label: round.label } });
    return NextResponse.json({
      ...round,
      raisedUsd: round.raisedUsd !== null ? Number(round.raisedUsd) : null,
      preMoneyUsd: round.preMoneyUsd !== null ? Number(round.preMoneyUsd) : null,
      postMoneyUsd: round.postMoneyUsd !== null ? Number(round.postMoneyUsd) : null,
    });
  } catch (err) {
    console.error("POST /api/admin/rounds error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
