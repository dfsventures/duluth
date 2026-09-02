export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { matchPortfolioCompanies, type PortcoCandidate } from "@/lib/portco-match";

// Part 31, WS76.2 — powers WS78.2's standing "Links" reconciliation view
// (D1: the non-signup-time surface). Unlike the per-signup matches route
// (which treats one pending User's company as the input), this route has
// to produce suggestions for potentially many unlinked PortfolioCompany
// rows in one response.
//
// Rather than inventing a second matching direction, this reuses
// matchPortfolioCompanies() in its one tested shape (a "signup" — name +
// aliases + email — scored against PortfolioCompany candidates with their
// contact lists) by treating each *operational* Company as if it were a
// fresh signup: `Company.createdBy.email` stands in for the signup email
// (it's the same email a founder would have signed up with), and
// `Company.aliases` is passed straight through exactly as WS76.1 does.
// The results are then inverted and grouped by portfolioCompanyId so the
// UI can render "this unlinked portfolio company's top suggestions."
// Every unlinked PortfolioCompany is a matcher candidate — JC-LK-F: no
// approvedCompanyFilter anywhere in this file, so a pending signup's
// Company is visible as a candidate here too.
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const [portfolioCompanies, companies] = await Promise.all([
      db.portfolioCompany.findMany({
        select: {
          id: true,
          name: true,
          companyId: true,
          contacts: { select: { email: true } },
        },
      }),
      db.company.findMany({
        select: {
          id: true,
          name: true,
          aliases: true,
          createdAt: true,
          createdBy: { select: { email: true } },
          portfolioCompany: { select: { id: true } },
        },
      }),
    ]);

    const unlinkedPortfolioCompanies = portfolioCompanies.filter((pc) => pc.companyId === null);
    const candidates: PortcoCandidate[] = unlinkedPortfolioCompanies.map((pc) => ({
      id: pc.id,
      name: pc.name,
      companyId: pc.companyId,
      contactEmails: pc.contacts.map((c) => c.email),
    }));

    const byPortfolioCompany = new Map<
      string,
      { companyId: string; companyName: string; tier: string; reasons: string[] }[]
    >();
    for (const pc of unlinkedPortfolioCompanies) byPortfolioCompany.set(pc.id, []);

    const unlinkedCompanies = companies.filter((c) => !c.portfolioCompany);
    for (const company of unlinkedCompanies) {
      const matches = matchPortfolioCompanies(
        { companyName: company.name, aliases: company.aliases, signupEmail: company.createdBy.email },
        candidates
      );
      for (const m of matches) {
        byPortfolioCompany.get(m.portfolioCompanyId)?.push({
          companyId: company.id,
          companyName: company.name,
          tier: m.tier,
          reasons: m.reasons,
        });
      }
    }

    const results = unlinkedPortfolioCompanies.map((pc) => ({
      portfolioCompanyId: pc.id,
      portfolioCompanyName: pc.name,
      matches: byPortfolioCompany.get(pc.id) ?? [],
    }));

    const companiesWithoutPortfolioCompany = unlinkedCompanies.map((c) => ({
      id: c.id,
      name: c.name,
      createdAt: c.createdAt,
      ownerEmail: c.createdBy.email,
    }));

    return NextResponse.json({ results, companiesWithoutPortfolioCompany });
  } catch (err) {
    console.error("GET /api/admin/portfolio-companies/link-suggestions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
