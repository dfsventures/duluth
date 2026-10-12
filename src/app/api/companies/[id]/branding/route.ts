export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { DEFAULT_BRAND_HEX, normalizeBrandHex, normalizeLogoPlate } from "@/lib/brand-theme";

/**
 * Investor update branding (accent colour + logo plate). Same permission as
 * editing the company profile. Only the picked hex is stored; the server never
 * trusts client-supplied derived colours.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const data: { brandColor?: string | null; logoPlate?: string } = {};

    if (body.brandColor !== undefined) {
      if (body.brandColor === null || (typeof body.brandColor === "string" && body.brandColor.trim() === "")) {
        data.brandColor = null;
      } else {
        const hex = normalizeBrandHex(body.brandColor);
        if (!hex) {
          return NextResponse.json(
            { error: "Enter a colour as 3 or 6 hex digits, for example #12A5B0." },
            { status: 400 }
          );
        }
        // Saving the Molly default stores null.
        data.brandColor = hex === DEFAULT_BRAND_HEX ? null : hex;
      }
    }

    if (body.logoPlate !== undefined) {
      const plate = normalizeLogoPlate(body.logoPlate);
      if (!plate) {
        return NextResponse.json({ error: "logoPlate must be LIGHT or BRAND" }, { status: 400 });
      }
      data.logoPlate = plate;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const before = await db.company.findUnique({
      where: { id },
      select: { brandColor: true, logoPlate: true },
    });
    if (!before) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const changed =
      (data.brandColor !== undefined && data.brandColor !== before.brandColor) ||
      (data.logoPlate !== undefined && data.logoPlate !== before.logoPlate);

    const company = await db.company.update({
      where: { id },
      data,
      select: { id: true, brandColor: true, logoPlate: true, logoWebKey: true, logoEmailKey: true },
    });

    if (changed) {
      await logAdminAction(user!, "COMPANY_BRANDING_UPDATED", {
        targetType: "Company",
        targetId: id,
        metadata: {
          brandColor: { from: before.brandColor, to: company.brandColor },
          logoPlate: { from: before.logoPlate, to: company.logoPlate },
        },
      });
    }

    return NextResponse.json({
      brandColor: company.brandColor,
      logoPlate: company.logoPlate,
    });
  } catch (err) {
    console.error("PATCH /api/companies/[id]/branding error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
