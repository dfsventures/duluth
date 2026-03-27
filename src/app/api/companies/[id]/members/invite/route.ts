export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { sendTeamInviteEmail, sendMemberAddedEmail } from "@/lib/email";
import crypto from "crypto";

function generateToken() {
  return {
    token: crypto.randomBytes(32).toString("hex"),
    tokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    // Must be admin or OWNER of this company
    const callerIsAdmin = user.roles.includes("ADMIN");
    if (!callerIsAdmin) {
      const callerMembership = await db.userCompanyMembership.findUnique({
        where: { userId_companyId: { userId: user.id, companyId: id } },
      });
      if (callerMembership?.role !== "OWNER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await request.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const role: string = body.role ?? "MEMBER";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!["MEMBER", "VIEWER"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be MEMBER or VIEWER" },
        { status: 400 }
      );
    }

    const company = await db.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const existingUser = await db.user.findUnique({ where: { email } });

    if (existingUser) {
      // PENDING or REJECTED: admin is vouching for them — approve and invite
      if (existingUser.status === "PENDING" || existingUser.status === "REJECTED") {
        const { token, tokenExpiresAt } = generateToken();
        await db.user.update({
          where: { id: existingUser.id },
          data: { status: "APPROVED", approvalToken: token, tokenExpiresAt },
        });

        const existingMembership = await db.userCompanyMembership.findUnique({
          where: { userId_companyId: { userId: existingUser.id, companyId: id } },
        });
        const membership =
          existingMembership ??
          (await db.userCompanyMembership.create({
            data: { userId: existingUser.id, companyId: id, role: role as "MEMBER" | "VIEWER" },
          }));

        sendTeamInviteEmail({
          toEmail: existingUser.email,
          inviterName: user.name ?? null,
          companyName: company.name,
          token,
        }).catch((err) => console.error("Failed to send team-invite email:", err));

        return NextResponse.json({
          membershipId: membership.id,
          userId: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          userRoles: existingUser.roles,
          membershipRole: membership.role,
        });
      }

      // APPROVED — from here on status is APPROVED
      // Check membership up front so all sub-cases below can use it
      const existingMembership = await db.userCompanyMembership.findUnique({
        where: { userId_companyId: { userId: existingUser.id, companyId: id } },
      });

      if (!existingUser.passwordHash) {
        // Account exists but password was never set — generate/reuse setup token
        const tokenExpired =
          !existingUser.tokenExpiresAt || existingUser.tokenExpiresAt < new Date();

        let activeToken: string;

        if (existingUser.approvalToken && !tokenExpired) {
          activeToken = existingUser.approvalToken;
        } else {
          const { token, tokenExpiresAt } = generateToken();
          await db.user.update({
            where: { id: existingUser.id },
            data: { approvalToken: token, tokenExpiresAt },
          });
          activeToken = token;
        }

        if (existingMembership) {
          // Already a member but never finished setup — resend the invite email
          sendTeamInviteEmail({
            toEmail: existingUser.email,
            inviterName: user.name ?? null,
            companyName: company.name,
            token: activeToken,
          }).catch((err) => console.error("Failed to resend team-invite email:", err));

          return NextResponse.json({
            membershipId: existingMembership.id,
            userId: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            userRoles: existingUser.roles,
            membershipRole: existingMembership.role,
          });
        }

        const membership = await db.userCompanyMembership.create({
          data: { userId: existingUser.id, companyId: id, role: role as "MEMBER" | "VIEWER" },
        });

        sendTeamInviteEmail({
          toEmail: existingUser.email,
          inviterName: user.name ?? null,
          companyName: company.name,
          token: activeToken,
        }).catch((err) => console.error("Failed to send team-invite email:", err));

        return NextResponse.json({
          membershipId: membership.id,
          userId: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          userRoles: existingUser.roles,
          membershipRole: membership.role,
        });
      }

      // Fully active user (has password)
      if (existingMembership) {
        return NextResponse.json(
          { error: "User is already a member of this company" },
          { status: 409 }
        );
      }

      const membership = await db.userCompanyMembership.create({
        data: { userId: existingUser.id, companyId: id, role: role as "MEMBER" | "VIEWER" },
      });

      // Generate a fresh token so the email has a direct set-password link.
      // This lets recipients access the platform without needing to know their
      // existing credentials — clicking the link sets (or resets) their password
      // and signs them in automatically.
      const { token: memberToken, tokenExpiresAt: memberTokenExpiresAt } = generateToken();
      await db.user.update({
        where: { id: existingUser.id },
        data: { approvalToken: memberToken, tokenExpiresAt: memberTokenExpiresAt },
      });

      sendMemberAddedEmail({
        toEmail: existingUser.email,
        inviterName: user.name ?? null,
        companyName: company.name,
        token: memberToken,
      }).catch((err) => console.error("Failed to send member-added email:", err));

      return NextResponse.json({
        membershipId: membership.id,
        userId: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
        userRoles: existingUser.roles,
        membershipRole: membership.role,
      });
    }

    // No user found — create account (APPROVED, no password yet) + membership
    const { token, tokenExpiresAt } = generateToken();

    const newUser = await db.user.create({
      data: {
        email,
        status: "APPROVED",
        approvalToken: token,
        tokenExpiresAt,
      },
    });

    const membership = await db.userCompanyMembership.create({
      data: { userId: newUser.id, companyId: id, role: role as "MEMBER" | "VIEWER" },
    });

    sendTeamInviteEmail({
      toEmail: email,
      inviterName: user.name ?? null,
      companyName: company.name,
      token,
    }).catch((err) => console.error("Failed to send team-invite email:", err));

    return NextResponse.json({
      membershipId: membership.id,
      userId: newUser.id,
      name: newUser.name,
      email: newUser.email,
      userRoles: newUser.roles,
      membershipRole: membership.role,
    });
  } catch (err) {
    console.error("POST /api/companies/[id]/members/invite error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
