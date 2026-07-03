export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const { error } = await requireCompanyAccess(companyId);
    if (error) return error;

    const where = { link: { companies: { some: { companyId } } } };
    const [totalViews, recentViews] = await Promise.all([
      db.shareableLinkView.count({ where }),
      db.shareableLinkView.findMany({
        where,
        orderBy: { viewedAt: "desc" },
        take: 5,
        select: {
          id: true,
          email: true,
          viewedAt: true,
          link: { select: { label: true } },
        },
      }),
    ]);

    return NextResponse.json({ totalViews, recentViews });
  } catch (err) {
    console.error("GET /api/companies/[id]/engagement error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
