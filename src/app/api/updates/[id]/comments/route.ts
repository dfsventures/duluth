export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { sendCommentNotificationEmail } from "@/lib/email";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const update = await db.update.findUnique({
      where: { id },
      select: { companyId: true },
    });

    if (!update) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const { error } = await requireCompanyAccess(update.companyId);
    if (error) return error;

    const comments = await db.comment.findMany({
      where: { updateId: id },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            roles: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json(comments);
  } catch (err) {
    console.error("GET /api/updates/[id]/comments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const update = await db.update.findUnique({
      where: { id },
      select: {
        companyId: true,
        title: true,
        period: true,
        company: { select: { name: true } },
      },
    });

    if (!update) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const { user, error } = await requireCompanyAccess(update.companyId);
    if (error) return error;

    const body = await request.json();

    if (!body.body || typeof body.body !== "string" || body.body.trim().length === 0) {
      return NextResponse.json(
        { error: "Comment body is required" },
        { status: 400 }
      );
    }

    const comment = await db.comment.create({
      data: {
        updateId: id,
        authorId: user!.id,
        body: body.body.trim(),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            roles: true,
            image: true,
          },
        },
      },
    });

    // Fire-and-forget: notify the other party when a comment is left
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const snippet = body.body.trim().replace(/<[^>]*>/g, "").slice(0, 200);
    const commenterIsAdmin = user!.roles.includes("ADMIN");

    if (commenterIsAdmin) {
      // Notify all founders on this company (skip the commenter in the unlikely case they're also a member)
      db.userCompanyMembership.findMany({
        where: { companyId: update.companyId },
        include: { user: { select: { id: true, name: true, email: true, roles: true } } },
      }).then((memberships) => {
        const sends = memberships
          .filter((m) => m.user.roles.includes("FOUNDER") && m.user.id !== user!.id)
          .map((m) =>
            sendCommentNotificationEmail({
              toEmail: m.user.email,
              toName: m.user.name,
              commenterName: user!.name ?? null,
              companyName: update.company.name,
              updateTitle: update.title,
              updatePeriod: update.period,
              commentSnippet: snippet,
              ctaLink: `${baseUrl}/updates/${id}`,
              ctaLabel: "View Comment →",
            })
          );
        Promise.allSettled(sends).then((results) => {
          results.forEach((r, i) => {
            if (r.status === "rejected")
              console.error(`Comment notification email ${i} failed:`, r.reason);
          });
        });
      }).catch((err) => console.error("Failed to fetch members for comment notification:", err));
    } else {
      // Notify all admins
      db.user.findMany({
        where: { roles: { has: "ADMIN" } },
        select: { id: true, name: true, email: true },
      }).then((admins) => {
        const sends = admins
          .filter((a) => a.id !== user!.id)
          .map((a) =>
            sendCommentNotificationEmail({
              toEmail: a.email,
              toName: a.name,
              commenterName: user!.name ?? null,
              companyName: update.company.name,
              updateTitle: update.title,
              updatePeriod: update.period,
              commentSnippet: snippet,
              ctaLink: `${baseUrl}/admin/companies/${update.companyId}`,
              ctaLabel: "View in Dashboard →",
            })
          );
        Promise.allSettled(sends).then((results) => {
          results.forEach((r, i) => {
            if (r.status === "rejected")
              console.error(`Comment notification email ${i} failed:`, r.reason);
          });
        });
      }).catch((err) => console.error("Failed to fetch admins for comment notification:", err));
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    console.error("POST /api/updates/[id]/comments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
