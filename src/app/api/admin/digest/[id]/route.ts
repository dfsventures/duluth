export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const digest = await db.weeklyDigest.findUnique({
      where: { id },
      include: {
        todos: {
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!digest) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(digest);
  } catch (err) {
    console.error("GET /api/admin/digest/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const existing = await db.weeklyDigest.findUnique({ where: { id }, select: { sentAt: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Editable if draft or sent within 12 hours
    if (existing.sentAt) {
      const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
      if (Date.now() - existing.sentAt.getTime() > TWELVE_HOURS_MS) {
        return NextResponse.json({ error: "Digest can only be edited within 12 hours of sending" }, { status: 403 });
      }
    }

    const body = await request.json() as {
      title?: string;
      weekOf?: string;
      sections?: { id: string; heading: string; content: string }[];
      todos?: { text: string }[];
    };

    const digest = await db.$transaction(async (tx) => {
      const updated = await tx.weeklyDigest.update({
        where: { id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.weekOf !== undefined && { weekOf: new Date(body.weekOf) }),
          ...(body.sections !== undefined && { sections: body.sections }),
        },
      });

      if (Array.isArray(body.todos)) {
        await tx.digestTodo.deleteMany({ where: { digestId: id } });
        if (body.todos.length > 0) {
          await tx.digestTodo.createMany({
            data: body.todos.map((t) => ({
              id: crypto.randomUUID().replace(/-/g, "").slice(0, 25),
              digestId: id,
              text: t.text,
            })),
          });
        }
      }

      return updated;
    });

    const full = await db.weeklyDigest.findUnique({
      where: { id },
      include: {
        todos: {
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json(full);
  } catch (err) {
    console.error("PATCH /api/admin/digest/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const existing = await db.weeklyDigest.findUnique({ where: { id }, select: { sentAt: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (existing.sentAt) {
      return NextResponse.json({ error: "Sent digests cannot be deleted" }, { status: 403 });
    }

    await db.weeklyDigest.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/admin/digest/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
