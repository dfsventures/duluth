export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const digests = await db.weeklyDigest.findMany({
      orderBy: { weekOf: "desc" },
      include: {
        todos: {
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json(digests);
  } catch (err) {
    console.error("GET /api/admin/digest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { weekOf, title, sections, todos = [] } = body as {
      weekOf: string;
      title: string;
      sections: { id: string; heading: string; content: string }[];
      todos: { text: string; assigneeId?: string }[];
    };

    if (!weekOf || !title || !Array.isArray(sections)) {
      return NextResponse.json({ error: "weekOf, title, and sections are required" }, { status: 400 });
    }

    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 25);

    const digest = await db.weeklyDigest.create({
      data: {
        id,
        weekOf: new Date(weekOf),
        title,
        sections,
        todos: {
          create: todos.map((t) => ({
            id: crypto.randomUUID().replace(/-/g, "").slice(0, 25),
            text: t.text,
            assigneeId: t.assigneeId ?? null,
          })),
        },
      },
      include: {
        todos: {
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    await logAdminAction(user!, "DIGEST_CREATED", { targetType: "WeeklyDigest", targetId: digest.id, metadata: { title: digest.title } });
    return NextResponse.json(digest, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/digest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
