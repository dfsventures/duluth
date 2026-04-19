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

    const notes = await db.companyNote.findMany({
      where: { companyId: id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        revisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { editedBy: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { revisions: true } },
      },
      orderBy: { occurredAt: "desc" },
    });

    return NextResponse.json(notes);
  } catch (err) {
    console.error("GET /api/companies/[id]/notes error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { title, body: noteBody, occurredAt, transcriptUrl } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!noteBody?.trim()) {
      return NextResponse.json({ error: "Body is required" }, { status: 400 });
    }
    if (!occurredAt) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    const company = await db.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const note = await db.companyNote.create({
      data: {
        companyId: id,
        createdById: user!.id,
        title: title.trim(),
        body: noteBody,
        occurredAt: new Date(occurredAt),
        transcriptUrl: transcriptUrl?.trim() || null,
        revisions: {
          create: {
            title: title.trim(),
            body: noteBody,
            occurredAt: new Date(occurredAt),
            transcriptUrl: transcriptUrl?.trim() || null,
            editedById: user!.id,
          },
        },
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        revisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { editedBy: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { revisions: true } },
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    console.error("POST /api/companies/[id]/notes error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
