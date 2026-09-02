export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Part 30, WS70.3 — CSV contacts import, modeled on
// /api/admin/companies/import/route.ts. Parsing stays client-side; this
// route takes JSON rows (no multipart, no new dependency). One endpoint,
// two entry points (JC-BC-M): portfolio-wide (no defaultPortfolioCompanyId,
// `company` column required per row) and per-company (scoped via
// defaultPortfolioCompanyId, a two-column name/email file also works).
//
// Upsert on (portfolioCompanyId, email) — JC-BC-K — not create-only-skip
// like the companies importer: a contact is a two-field record with a
// natural key, and the workflow is "fix the spreadsheet, re-upload."
// Unmatched company names are skipped and reported, NEVER auto-created
// (JC-BC-L) — following src/lib/sheet-link.ts's "never guess" doctrine.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactRow {
  row: number;
  company?: string;
  name?: string;
  email: string;
  role?: string;
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const rows: ContactRow[] = body.contacts;
    const defaultPortfolioCompanyId: string | undefined =
      typeof body.defaultPortfolioCompanyId === "string" ? body.defaultPortfolioCompanyId : undefined;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No contacts provided" }, { status: 400 });
    }
    if (rows.length > 1000) {
      return NextResponse.json({ error: "Too many rows — please split into batches of 1000 or fewer." }, { status: 400 });
    }

    // If a default company is given, verify it exists up front — 404 is the
    // conventional response for a bad id in this codebase's admin routes.
    if (defaultPortfolioCompanyId) {
      const defaultCompany = await db.portfolioCompany.findUnique({ where: { id: defaultPortfolioCompanyId } });
      if (!defaultCompany) {
        return NextResponse.json({ error: "Default portfolio company not found" }, { status: 404 });
      }
    }

    const allCompanies = await db.portfolioCompany.findMany({ select: { id: true, name: true } });
    const byName = new Map(allCompanies.map((c) => [c.name.trim().toLowerCase(), c]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const unmatchedCompanies = new Set<string>();

    for (const row of rows) {
      try {
        const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
        if (!email || !EMAIL_REGEX.test(email)) {
          errors.push(`Row ${row.row}: invalid or missing email`);
          skipped++;
          continue;
        }

        const companyCell = typeof row.company === "string" ? row.company.trim() : "";

        let portfolioCompanyId: string | null = null;

        if (companyCell) {
          const match = byName.get(companyCell.toLowerCase());
          if (!match) {
            unmatchedCompanies.add(companyCell);
            errors.push(`Row ${row.row}: no portfolio company named "${companyCell}"`);
            skipped++;
            continue;
          }
          // Scoped (per-company) entry point: a row naming a DIFFERENT
          // company is a row-level error, never a silent write elsewhere.
          if (defaultPortfolioCompanyId && match.id !== defaultPortfolioCompanyId) {
            errors.push(
              `Row ${row.row}: names "${companyCell}" — use the portfolio-wide import on the Portfolio Contacts page`
            );
            skipped++;
            continue;
          }
          portfolioCompanyId = match.id;
        } else if (defaultPortfolioCompanyId) {
          portfolioCompanyId = defaultPortfolioCompanyId;
        } else {
          errors.push(`Row ${row.row}: no company named`);
          skipped++;
          continue;
        }

        const name = typeof row.name === "string" ? row.name.trim() : "";
        const role = typeof row.role === "string" ? row.role.trim() : "";

        const existing = await db.portfolioCompanyContact.findUnique({
          where: { portfolioCompanyId_email: { portfolioCompanyId, email } },
        });

        if (existing) {
          // Sparse re-upload never blanks good data — only non-empty cells overwrite.
          await db.portfolioCompanyContact.update({
            where: { id: existing.id },
            data: {
              ...(name ? { name } : {}),
              ...(role ? { role } : {}),
            },
          });
          updated++;
        } else {
          await db.portfolioCompanyContact.create({
            data: { portfolioCompanyId, email, name: name || null, role: role || null },
          });
          created++;
        }
      } catch (rowErr) {
        errors.push(`Row ${row.row}: ${rowErr instanceof Error ? rowErr.message : "failed to import"}`);
        skipped++;
      }
    }

    await logAdminAction(user!, "PORTCO_CONTACTS_IMPORTED", {
      metadata: {
        created,
        updated,
        skipped,
        errorCount: errors.length,
        unmatchedCount: unmatchedCompanies.size,
        scope: defaultPortfolioCompanyId ? "COMPANY" : "PORTFOLIO",
      },
    });

    return NextResponse.json({
      created,
      updated,
      skipped,
      errors,
      unmatchedCompanies: [...unmatchedCompanies],
    });
  } catch (err) {
    console.error("POST /api/admin/portfolio-companies/contacts/import error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
