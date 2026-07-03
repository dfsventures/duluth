export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

interface CompanyRow {
  name: string;
  website: string | null;
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const rows: CompanyRow[] = body.companies;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No companies provided" }, { status: 400 });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const name = row.name?.trim();
      if (!name) continue;

      try {
        const existing = await db.company.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await db.company.create({
          data: {
            name,
            website: row.website?.trim() || null,
            createdById: user!.id,
          },
        });

        created++;
      } catch {
        errors.push(`Failed to create "${name}"`);
      }
    }

    await logAdminAction(user!, "COMPANIES_IMPORTED", { metadata: { created, skipped, errorCount: errors.length } });
    return NextResponse.json({ created, skipped, errors });
  } catch (err) {
    console.error("POST /api/admin/companies/import error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
