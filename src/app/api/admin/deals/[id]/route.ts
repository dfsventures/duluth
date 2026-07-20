export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { sheetsSyncEnabled } from "@/lib/sheets";

const VALID_TYPES = ["INITIAL", "FOLLOW_ON"];

// Part 10, WS27.5 (Q22-B/Q26) — while sync is enabled, a deal linked to a
// sheet row (sheetRowId set) has these fields owned by the tracker sheet;
// edits happen there and arrive on the next sync. Ledger-side fields
// (roundId/convertedInRoundId/ownershipPct) stay editable always — they
// don't exist in the sheet. Ground rule 4: a fork with no Google env vars,
// or a manually-created deal (sheetRowId null), sees zero change here.
const SHEET_OWNED_DEAL_FIELDS = ["investmentType", "dealDate", "amountUsd", "instrument", "entryValuation", "currentValuation", "notes"];
const SYNCED_DEAL_MESSAGE = "This deal is synced from the tracker sheet — edit it there; changes arrive on the next sync.";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.deal.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const body = await request.json();

    if (sheetsSyncEnabled() && existing.sheetRowId) {
      const attemptedSheetField = SHEET_OWNED_DEAL_FIELDS.find((f) => body[f] !== undefined);
      if (attemptedSheetField) {
        return NextResponse.json({ error: SYNCED_DEAL_MESSAGE }, { status: 409 });
      }
    }
    const data: {
      investmentType?: string;
      dealDate?: Date;
      country?: string | null;
      amountUsd?: number;
      instrument?: string | null;
      entryValuation?: number | null;
      currentValuation?: number | null;
      valuationAsOf?: Date;
      notes?: string | null;
      roundId?: string | null;
      convertedInRoundId?: string | null;
      ownershipPct?: number | null;
    } = {};

    if (body.investmentType !== undefined) {
      if (!VALID_TYPES.includes(body.investmentType)) {
        return NextResponse.json({ error: "investmentType must be INITIAL or FOLLOW_ON." }, { status: 400 });
      }
      data.investmentType = body.investmentType;
    }
    if (body.dealDate !== undefined) {
      const d = new Date(body.dealDate);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid dealDate." }, { status: 400 });
      data.dealDate = d;
    }
    if (body.country !== undefined) data.country = body.country?.trim() || null;
    if (body.amountUsd !== undefined) {
      const amt = Number(body.amountUsd);
      if (!amt || amt <= 0) return NextResponse.json({ error: "amountUsd must be greater than 0." }, { status: 400 });
      data.amountUsd = amt;
    }
    if (body.instrument !== undefined) data.instrument = body.instrument?.trim() || null;
    if (body.entryValuation !== undefined) {
      data.entryValuation = body.entryValuation === null || body.entryValuation === "" ? null : Number(body.entryValuation);
    }
    // Setting currentValuation also updates valuationAsOf — this is the
    // ongoing valuation-maintenance path now that Molly is the source of truth.
    if (body.currentValuation !== undefined) {
      data.currentValuation = body.currentValuation === null || body.currentValuation === "" ? null : Number(body.currentValuation);
      data.valuationAsOf = new Date();
    }
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    // WS25.1 (additive): ledger pointers on the existing deal PATCH.
    if (body.roundId !== undefined) {
      if (body.roundId) {
        const round = await db.financingRound.findUnique({ where: { id: body.roundId } });
        if (!round || round.portfolioCompanyId !== existing.portfolioCompanyId) {
          return NextResponse.json({ error: "roundId must reference a round belonging to this deal's portfolio company." }, { status: 400 });
        }
      }
      data.roundId = body.roundId || null;
    }
    if (body.convertedInRoundId !== undefined) {
      if (body.convertedInRoundId) {
        const round = await db.financingRound.findUnique({ where: { id: body.convertedInRoundId } });
        if (!round || round.portfolioCompanyId !== existing.portfolioCompanyId) {
          return NextResponse.json({ error: "convertedInRoundId must reference a round belonging to this deal's portfolio company." }, { status: 400 });
        }
      }
      data.convertedInRoundId = body.convertedInRoundId || null;
    }
    if (body.ownershipPct !== undefined) {
      if (body.ownershipPct === null || body.ownershipPct === "") {
        data.ownershipPct = null;
      } else {
        const pct = Number(body.ownershipPct);
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
          return NextResponse.json({ error: "ownershipPct must be between 0 and 100." }, { status: 400 });
        }
        data.ownershipPct = pct;
      }
    }

    const deal = await db.deal.update({ where: { id }, data });

    await logAdminAction(user!, "DEAL_UPDATED", {
      targetType: "Deal",
      targetId: id,
      metadata: {
        previousValuation: existing.currentValuation !== null ? Number(existing.currentValuation) : null,
        newValuation: deal.currentValuation !== null ? Number(deal.currentValuation) : null,
      },
    });
    return NextResponse.json({
      ...deal,
      amountUsd: Number(deal.amountUsd),
      entryValuation: deal.entryValuation !== null ? Number(deal.entryValuation) : null,
      currentValuation: deal.currentValuation !== null ? Number(deal.currentValuation) : null,
      ownershipPct: deal.ownershipPct !== null ? Number(deal.ownershipPct) : null,
    });
  } catch (err) {
    console.error("PATCH /api/admin/deals/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.deal.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    if (sheetsSyncEnabled() && existing.sheetRowId) {
      return NextResponse.json({ error: SYNCED_DEAL_MESSAGE }, { status: 409 });
    }

    await db.deal.delete({ where: { id } });

    await logAdminAction(user!, "DEAL_DELETED", { targetType: "Deal", targetId: id, metadata: { fundId: existing.fundId, portfolioCompanyId: existing.portfolioCompanyId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/deals/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
