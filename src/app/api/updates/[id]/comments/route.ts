export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";

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
            role: true,
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
      select: { companyId: true },
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
            role: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    console.error("POST /api/updates/[id]/comments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
