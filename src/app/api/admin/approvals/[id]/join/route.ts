export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { hasFounderWhere } from "@/lib/founder-updates";

// Part 45 (WS153, Marge Q-PU9 (a)). A pending signup whose company matches a
// company with no founder yet joins that company as its OWNER instead of
// producing a duplicate; the signup's own (empty) company is deleted. This
// route does only the join. Approval is the existing approve route, called by
// the page right after, unchanged: the founder gets the same approval email as
// any approved signup, and nothing else is sent.
const HAS_CONTENT = "This signup's company already has content. Approve it and merge by hand.";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const companyId = typeof body?.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const signup = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        memberships: {
          select: {
            companyId: true,
            company: {
              select: {
                id: true,
                createdById: true,
                stage: true,
                portfolioCompany: { select: { id: true } },
                diligence: { select: { id: true } },
                _count: {
                  select: {
                    memberships: true,
                    updates: true,
                    metricDefinitions: true,
                    documents: true,
                    notes: true,
                    shareableLinks: true,
                    capTableScenarios: true,
                    memos: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!signup) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (signup.status !== "PENDING") {
      return NextResponse.json({ error: "User is not in PENDING status" }, { status: 400 });
    }

    const own = signup.memberships[0]?.company;
    if (!own) {
      return NextResponse.json({ error: "User or their company not found" }, { status: 404 });
    }
    if (own.id === companyId) {
      return NextResponse.json({ error: "That is this signup's own company." }, { status: 400 });
    }
    const c = own._count;
    const hasContent =
      own.createdById !== signup.id ||
      own.stage === "DILIGENCE" ||
      own.portfolioCompany !== null ||
      own.diligence !== null ||
      c.memberships > 1 ||
      c.updates + c.metricDefinitions + c.documents + c.notes + c.shareableLinks + c.capTableScenarios + c.memos > 0;
    if (hasContent) {
      return NextResponse.json({ error: HAS_CONTENT }, { status: 409 });
    }

    const removedCompanyId = own.id;
    const joined = await db.$transaction(async (tx) => {
      // Re-check inside the transaction: the target must still have no founder.
      const stillUnclaimed = await tx.company.findFirst({
        where: { id: companyId, NOT: hasFounderWhere },
        select: { id: true },
      });
      if (!stillUnclaimed) return false;
      await tx.userCompanyMembership.create({
        data: { userId: signup.id, companyId, role: "OWNER" },
      });
      await tx.company.delete({ where: { id: removedCompanyId } });
      return true;
    });
    if (!joined) {
      return NextResponse.json(
        { error: "That company already has a founder, or no longer exists." },
        { status: 409 }
      );
    }

    await logAdminAction(actor!, "SIGNUP_JOINED_COMPANY", {
      targetType: "User",
      targetId: signup.id,
      metadata: { userId: signup.id, companyId, removedCompanyId },
    });
    return NextResponse.json({ joined: true, companyId });
  } catch (err) {
    console.error("POST /api/admin/approvals/[id]/join error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
