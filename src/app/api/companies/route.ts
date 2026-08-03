export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { generateSetupToken } from "@/lib/setup-token";
import { sendDiligenceInviteEmail } from "@/lib/email";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export async function GET() {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    if (user!.roles.includes("ADMIN")) {
      const companies = await db.company.findMany({
        include: {
          _count: {
            select: {
              memberships: true,
              updates: true,
            },
          },
          updates: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true, title: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const result = companies.map((c) => ({
        ...c,
        memberCount: c._count.memberships,
        updateCount: c._count.updates,
        lastUpdate: c.updates[0] || null,
        updates: undefined,
      }));

      return NextResponse.json(result);
    }

    // Founder: return only their companies
    const memberships = await db.userCompanyMembership.findMany({
      where: { userId: user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        company: {
          include: {
            _count: {
              select: {
                memberships: true,
                updates: true,
              },
            },
            updates: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { createdAt: true, title: true, status: true },
            },
          },
        },
      },
    });

    const result = memberships.map((m) => ({
      ...m.company,
      memberCount: m.company._count.memberships,
      updateCount: m.company._count.updates,
      lastUpdate: m.company.updates[0] || null,
      updates: undefined,
      membershipRole: m.role,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/companies error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const body = await request.json();
    const { name, description, website, sector, geography, fundingStage } =
      body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    if (user!.roles.includes("ADMIN")) {
      const { userEmail, userName, dueDiligence } = body as {
        userEmail?: string;
        userName?: string;
        dueDiligence?: { isStellarEcosystem?: boolean } | null;
      };

      const result = await db.$transaction(async (tx: TransactionClient) => {
        let assignUserId = user!.id;
        let setupToken: string | null = null;

        // Admin can optionally create/assign a founder user
        if (userEmail) {
          let founderUser = await tx.user.findUnique({
            where: { email: userEmail },
          });

          if (!founderUser) {
            const { token, tokenExpiresAt } = generateSetupToken();
            founderUser = await tx.user.create({
              data: {
                email: userEmail,
                name: userName || null,
                roles: ["FOUNDER"],
                status: "APPROVED", // matches the working members/invite pattern, not PENDING
                approvalToken: token,
                tokenExpiresAt,
              },
            });
            setupToken = token;
          }
          assignUserId = founderUser.id;
        }

        const newCompany = await tx.company.create({
          data: {
            name: name.trim(),
            description: description || null,
            website: website || null,
            sector: sector || null,
            geography: geography || null,
            fundingStage: fundingStage || null,
            createdById: user!.id, // unchanged convention — always the admin, matches today's precedent
            stage: dueDiligence ? "DILIGENCE" : "ACTIVE",
          },
        });

        if (dueDiligence) {
          await tx.companyDiligence.create({
            data: {
              companyId: newCompany.id,
              isStellarEcosystem: dueDiligence.isStellarEcosystem ?? false,
            },
          });
        }

        await tx.userCompanyMembership.create({
          data: {
            userId: assignUserId,
            companyId: newCompany.id,
            role: "OWNER",
          },
        });

        return { newCompany, setupToken, founderEmail: userEmail || null };
      });

      if (dueDiligence && result.setupToken && result.founderEmail) {
        sendDiligenceInviteEmail({
          toEmail: result.founderEmail,
          companyName: result.newCompany.name,
          token: result.setupToken,
        }).catch((err) => console.error("Failed to send diligence-invite email:", err));
      }

      await logAdminAction(user!, "COMPANY_CREATED", {
        targetType: "Company",
        targetId: result.newCompany.id,
        metadata: { name: result.newCompany.name, dueDiligence: !!dueDiligence },
      });
      return NextResponse.json(result.newCompany, { status: 201 });
    }

    // Founder: auto-assign to themselves
    const company = await db.$transaction(async (tx: TransactionClient) => {
      const newCompany = await tx.company.create({
        data: {
          name: name.trim(),
          description: description || null,
          website: website || null,
          sector: sector || null,
          geography: geography || null,
          fundingStage: fundingStage || null,
          createdById: user!.id,
        },
      });

      await tx.userCompanyMembership.create({
        data: {
          userId: user!.id,
          companyId: newCompany.id,
          role: "OWNER",
        },
      });

      return newCompany;
    });

    return NextResponse.json(company, { status: 201 });
  } catch (err) {
    console.error("POST /api/companies error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
