export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { getSheetRows, sheetsSyncEnabled } from "@/lib/sheets";
import { parseSheetLinkRows, matchDealsToSheetRows, type LinkableDeal } from "@/lib/sheet-link";

// Part 10, WS27 — the one-time "link existing deals to sheet rows" step.
// This is deliberately a requireAdmin-gated route, not a script: the
// Google service-account credentials are Vercel "Sensitive" env vars that
// can never be read back out locally (not via `vercel env pull`, not via
// the dashboard), so this logic can only run inside the deployed app —
// and doing it as a real admin-session route (rather than a bare/secret-
// header endpoint) means it can never be triggered by a stray curl the
// way the cron incident that motivated this (see
// docs/IMPLEMENTATION_PLAN.md's WS27 status note) was.
//
// POST body: { apply?: boolean }. apply=false (default) is a pure preview
// — reads the live sheet + DB, reports a match per deal, writes nothing.
// apply=true writes Deal.sheetRowId for matched deals only, and ONLY if
// the same match pass produces zero ambiguous/unmatched deals (all-or-
// nothing — deliberately no partial-apply-with-override; there are only
// 76 rows and this is one-time, so the simpler/safer shape wins). Already-
// linked deals (sheetRowId already set) are always skipped — idempotent,
// safe to re-run.

interface DealForLink {
  id: string;
  sheetRowId: string | null;
  investmentType: string;
  dealDate: Date;
  amountUsd: unknown;
  portfolioCompany: { name: string };
  fund: { name: string };
}

async function loadLinkableDeals(): Promise<LinkableDeal[]> {
  const deals: DealForLink[] = await db.deal.findMany({
    select: {
      id: true,
      sheetRowId: true,
      investmentType: true,
      dealDate: true,
      amountUsd: true,
      portfolioCompany: { select: { name: true } },
      fund: { select: { name: true } },
    },
    orderBy: { dealDate: "asc" },
  });
  return deals.map((d) => ({
    id: d.id,
    sheetRowId: d.sheetRowId,
    companyName: d.portfolioCompany.name,
    vehicleName: d.fund.name,
    investmentType: d.investmentType,
    dealDate: d.dealDate,
    amountUsd: Number(d.amountUsd),
  }));
}

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  if (!sheetsSyncEnabled()) {
    return NextResponse.json({ error: "Google Sheets sync is not configured (env vars absent)." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const apply = Boolean(body?.apply);

  const sheet = await getSheetRows();
  const sheetRows = parseSheetLinkRows(sheet);
  const deals = await loadLinkableDeals();
  const matches = matchDealsToSheetRows(deals, sheetRows);

  const matched = matches.filter((m) => m.status === "matched");
  const alreadyLinked = matches.filter((m) => m.status === "already-linked");
  const ambiguous = matches.filter((m) => m.status === "ambiguous");
  const unmatched = matches.filter((m) => m.status === "unmatched");
  const counts = { total: matches.length, matched: matched.length, alreadyLinked: alreadyLinked.length, ambiguous: ambiguous.length, unmatched: unmatched.length };

  if (!apply) {
    return NextResponse.json({ applied: false, matches, counts });
  }

  if (ambiguous.length > 0 || unmatched.length > 0) {
    return NextResponse.json(
      {
        error: `Refusing to apply: ${ambiguous.length} ambiguous and ${unmatched.length} unmatched deal(s) remain. Fix the data (sheet or Molly) and re-run the preview until it's clean.`,
        matches,
        counts,
      },
      { status: 400 }
    );
  }

  for (const m of matched) {
    // m.stableId is guaranteed non-null for status "matched".
    await db.deal.update({ where: { id: m.dealId }, data: { sheetRowId: m.stableId } });
  }

  await logAdminAction(
    { id: user!.id, email: user!.email },
    "DEALS_LINKED_TO_SHEET",
    {
      targetType: "Deal",
      metadata: {
        linkedCount: matched.length,
        alreadyLinkedCount: alreadyLinked.length,
        dealIds: matched.map((m) => m.dealId),
        stableIds: matched.map((m) => m.stableId),
      },
    }
  );

  return NextResponse.json({ applied: true, matches, counts });
}
