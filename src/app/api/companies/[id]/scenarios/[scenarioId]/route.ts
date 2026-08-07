export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { validateScenarioInputShape } from "@/lib/cap-table-validation";

// Part 29, WS66 — single CapTableScenario GET/PATCH/DELETE. Every handler
// re-checks requireCompanyAccess(id) AND that the fetched scenario's
// companyId === id — defense-in-depth against an IDOR of the WS55/F48
// shape, since [scenarioId] alone is never trusted as sufficient scoping.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; scenarioId: string }> }
) {
  try {
    const { id, scenarioId } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const scenario = await db.capTableScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario || scenario.companyId !== id) {
      return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
    }

    return NextResponse.json(scenario);
  } catch (err) {
    console.error("GET /api/companies/[id]/scenarios/[scenarioId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; scenarioId: string }> }
) {
  try {
    const { id, scenarioId } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const existing = await db.capTableScenario.findUnique({ where: { id: scenarioId } });
    if (!existing || existing.companyId !== id) {
      return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const data: { name?: string; inputs?: Prisma.InputJsonValue } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      data.name = body.name.trim();
    }

    if (body.inputs !== undefined) {
      const shapeError = validateScenarioInputShape(body.inputs);
      if (shapeError) {
        return NextResponse.json({ error: shapeError }, { status: 400 });
      }
      data.inputs = body.inputs;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await db.capTableScenario.update({ where: { id: scenarioId }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/companies/[id]/scenarios/[scenarioId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; scenarioId: string }> }
) {
  try {
    const { id, scenarioId } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const existing = await db.capTableScenario.findUnique({ where: { id: scenarioId } });
    if (!existing || existing.companyId !== id) {
      return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
    }

    await db.capTableScenario.delete({ where: { id: scenarioId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/companies/[id]/scenarios/[scenarioId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
