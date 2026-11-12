export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { matchPortfolioCompanies, type PortcoCandidate } from "@/lib/portco-match";
import { hasFounderWhere } from "@/lib/founder-updates";
import { matchUnclaimedCompanies } from "@/lib/unclaimed-match";

// Part 31, WS76 — suggests PortfolioCompany matches for one pending signup,
// for the "Link & approve" block on /admin/approvals (D1: approval-time
// surface). Read-only; the house does not audit reads.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        memberships: {
          include: {
            company: { select: { id: true, name: true, aliases: true } },
          },
        },
      },
    });

    const company = user?.memberships[0]?.company;
    if (!user || !company) {
      return NextResponse.json({ error: "User or their company not found" }, { status: 404 });
    }

    const portfolioCompanies = await db.portfolioCompany.findMany({
      select: {
        id: true,
        name: true,
        companyId: true,
        contacts: { select: { email: true } },
      },
    });

    const candidates: PortcoCandidate[] = portfolioCompanies.map((pc) => ({
      id: pc.id,
      name: pc.name,
      companyId: pc.companyId,
      contactEmails: pc.contacts.map((c) => c.email),
    }));

    const matches = matchPortfolioCompanies(
      { companyName: company.name, aliases: company.aliases, signupEmail: user.email },
      candidates
    );

    // D3: each match also carries whether the signup email is already a
    // contact on that portfolio company — drives the "add as contact"
    // checkbox's visibility with no extra round-trip.
    const contactsById = new Map(portfolioCompanies.map((pc) => [pc.id, pc.contacts.map((c) => c.email)]));
    const signupEmail = user.email.trim().toLowerCase();
    const matchesWithContactFlag = matches.map((m) => ({
      ...m,
      signupEmailIsAlreadyContact: (contactsById.get(m.portfolioCompanyId) ?? []).includes(signupEmail),
    }));

    // Part 45 (WS153): companies with no founder yet that this signup's company
    // looks like, so an admin can add the person to that page instead of
    // approving a second company. Additive; no address beyond signupEmail.
    const noFounder = await db.company.findMany({
      where: { id: { not: company.id }, NOT: hasFounderWhere },
      select: { id: true, name: true, aliases: true, website: true },
    });
    const unclaimed = matchUnclaimedCompanies(
      { companyName: company.name, aliases: company.aliases, email: user.email },
      noFounder
    );

    return NextResponse.json({
      companyId: company.id,
      companyName: company.name,
      signupEmail: user.email,
      matches: matchesWithContactFlag,
      unclaimed,
    });
  } catch (err) {
    console.error("GET /api/admin/approvals/[id]/matches error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
