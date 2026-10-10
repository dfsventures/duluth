export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

// A name index for the Ctrl/Cmd+K palette (UI overhaul phase 4). Read-only,
// admin-only, names and ids only; the client filters it. Scale is tens of rows
// per kind, so a generous cap rather than server-side search.
const CAP = 500;

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const [companies, funds, portfolioCompanies, lps] = await Promise.all([
      db.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: CAP }),
      db.fund.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: CAP }),
      db.portfolioCompany.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: CAP }),
      db.limitedPartner.findMany({
        select: { id: true, name: true, emails: { select: { email: true, isPrimary: true } } },
        orderBy: { createdAt: "desc" },
        take: CAP,
      }),
    ]);

    return NextResponse.json({
      companies,
      funds,
      portfolioCompanies,
      // An LP without a name is found by its primary address.
      lps: lps
        .map((l) => ({ id: l.id, name: l.name ?? (l.emails.find((e) => e.isPrimary) ?? l.emails[0])?.email ?? "" }))
        .filter((l) => l.name !== ""),
    });
  } catch (err) {
    console.error("GET /api/admin/search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
