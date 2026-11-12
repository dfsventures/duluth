export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { publishUpdate } from "@/lib/publish-update";
import { removeEmailUpdate } from "@/lib/founder-update-actions";
import { UPDATE_SOURCE_EMAIL } from "@/lib/marge-tools/portco-contract";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.update.findUnique({
      where: { id },
      select: { companyId: true, status: true, source: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const { user, error } = await requireCompanyAccess(existing.companyId);
    if (error) return error;

    // Part 45 (Q142 A): an admin may remove an update Marge filed from email,
    // with the figures filed alongside it. Every other case is unchanged.
    if (
      existing.status === "SENT" &&
      existing.source === UPDATE_SOURCE_EMAIL &&
      user!.roles.includes("ADMIN")
    ) {
      const removed = await removeEmailUpdate(user!, id);
      if (!removed.ok) {
        return NextResponse.json({ error: removed.error }, { status: removed.status });
      }
      return new NextResponse(null, { status: 204 });
    }

    if (existing.status === "SENT") {
      return NextResponse.json({ error: "Published updates cannot be deleted" }, { status: 403 });
    }

    await db.update.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/updates/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // First fetch the update to get companyId for access check
    const update = await db.update.findUnique({
      where: { id },
      select: { companyId: true },
    });

    if (!update) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const { user, error } = await requireCompanyAccess(update.companyId);
    if (error) return error;

    const isAdmin = user!.roles.includes("ADMIN");

    const fullUpdate = await db.update.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logo: true,
            sector: true,
          },
        },
        comments: {
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
        },
        documents: {
          where: isAdmin ? {} : { isInternal: false },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            isInternal: true,
            docType: true,
            createdAt: true,
          },
        },
        metricValues: {
          include: {
            metricDefinition: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Part 45 (WS151): where an email-filed update came from (Slack link, sender
    // domain) and the founder's quoted words are for admins only.
    if (fullUpdate && !isAdmin) {
      const { sourceRef: _sourceRef, filedAt: _filedAt, ...rest } = fullUpdate;
      void _sourceRef;
      void _filedAt;
      return NextResponse.json({
        ...rest,
        metricValues: rest.metricValues.map((mv) => {
          const { quote: _quote, enteredById: _enteredById, ...mvRest } = mv;
          void _quote;
          void _enteredById;
          return mvRest;
        }),
      });
    }

    return NextResponse.json(fullUpdate);
  } catch (err) {
    console.error("GET /api/updates/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.update.findUnique({
      where: { id },
      select: { companyId: true, status: true, sentAt: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const { user, error } = await requireCompanyAccess(existing.companyId);
    if (error) return error;

    // Published updates are editable for 3 days after sentAt
    if (existing.status === "SENT") {
      const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
      const sentAt = existing.sentAt ? existing.sentAt.getTime() : 0;
      if (Date.now() - sentAt > THREE_DAYS_MS) {
        return NextResponse.json(
          { error: "Published updates can only be edited within 3 days of publishing." },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    const justPublished = body.status === "SENT" && existing.status !== "SENT";

    if (body.title !== undefined) data.title = body.title;
    if (body.period !== undefined) data.period = body.period;
    if (body.body !== undefined) data.body = body.body;
    if (body.status !== undefined) {
      if (!["DRAFT", "SENT"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      // When justPublished, publishUpdate() below sets status/sentAt (and
      // clears scheduledFor) as part of the shared publish path — don't
      // duplicate that write here.
      if (!justPublished) {
        data.status = body.status;
      }
    }

    if (body.scheduledFor !== undefined) {
      // Only drafts can be scheduled — publishing now supersedes any schedule.
      if (existing.status === "SENT" || body.status === "SENT") {
        return NextResponse.json({ error: "Only drafts can be scheduled" }, { status: 400 });
      }
      if (body.scheduledFor === null) {
        data.scheduledFor = null;
      } else {
        const parsed = new Date(body.scheduledFor);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "Invalid scheduled date" }, { status: 400 });
        }
        if (parsed.getTime() <= Date.now()) {
          return NextResponse.json({ error: "Scheduled date must be in the future" }, { status: 400 });
        }
        data.scheduledFor = parsed;
      }
    }

    if (Object.keys(data).length === 0 && !body.metricValues && !justPublished) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // F152: every metric definition must belong to this update's company.
    const isAdmin = user!.roles.includes("ADMIN");
    if (Array.isArray(body.metricValues) && body.metricValues.length > 0) {
      const ids = Array.from(
        new Set(body.metricValues.map((mv: { metricDefinitionId: string }) => mv.metricDefinitionId))
      ).filter((v): v is string => typeof v === "string");
      const defs = await db.metricDefinition.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true },
      });
      const owned = new Map(defs.map((d) => [d.id, d.companyId]));
      const allOwn = body.metricValues.every(
        (mv: { metricDefinitionId: string }) => owned.get(mv.metricDefinitionId) === existing.companyId
      );
      if (!allOwn) {
        return NextResponse.json(
          { error: "That metric belongs to another company." },
          { status: 400 }
        );
      }
    }

    // Update fields and optionally replace metric values in a transaction
    // (the publish flip itself happens after, via publishUpdate())
    let updated = await db.$transaction(async (tx) => {
      const result =
        Object.keys(data).length > 0
          ? await tx.update.update({ where: { id }, data })
          : await tx.update.findUniqueOrThrow({ where: { id } });

      if (Array.isArray(body.metricValues) && body.metricValues.length > 0) {
        // Remove old metric values for this update and replace with new ones
        await tx.metricValue.deleteMany({ where: { updateId: id } });
        await tx.metricValue.createMany({
          data: body.metricValues.map((mv: { metricDefinitionId: string; value: number; date: string }) => ({
            metricDefinitionId: mv.metricDefinitionId,
            value: mv.value,
            date: new Date(mv.date),
            updateId: id,
            ...(isAdmin ? { enteredById: user!.id } : {}),
          })),
        });
      }

      return result;
    });

    if (justPublished) {
      const published = await publishUpdate(id);
      if (published) updated = published;
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/updates/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
