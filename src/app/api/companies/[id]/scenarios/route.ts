export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { validateScenarioInputShape, defaultScenarioInputs } from "@/lib/cap-table-validation";

// Part 29, WS66 — CapTableScenario list + create. Company-scoped, founder
// (or admin) access only via requireCompanyAccess. The computed
// stage-by-stage breakdown is never persisted (JC-CT-B) — these routes
// only ever read/write raw `inputs`.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const scenarios = await db.capTableScenario.findMany({
      where: { companyId: id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(scenarios);
  } catch (err) {
    console.error("GET /api/companies/[id]/scenarios error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Base case";

    const inputs = body?.inputs !== undefined ? body.inputs : defaultScenarioInputs();
    const shapeError = validateScenarioInputShape(inputs);
    if (shapeError) {
      return NextResponse.json({ error: shapeError }, { status: 400 });
    }

    const scenario = await db.capTableScenario.create({
      data: {
        companyId: id,
        createdById: user!.id,
        name,
        inputs,
      },
    });

    return NextResponse.json(scenario, { status: 201 });
  } catch (err) {
    console.error("POST /api/companies/[id]/scenarios error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
