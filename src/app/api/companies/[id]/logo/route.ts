export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { MAX_LOGO_BYTES, LogoError } from "@/lib/logo-process";
import { removeCompanyLogo, saveCompanyLogo } from "@/lib/logo-store";
import { logoPublicPath } from "@/lib/company-logo";

/**
 * Logo upload (multipart, field "file"). Bytes are validated and re-encoded
 * server-side by sharp; the original upload is never stored or served, and SVG
 * input is screened then rasterised. At most 2 MB, well under the platform body
 * limit, so this does not need a presigned browser upload (and so cannot be
 * broken by R2 CORS).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_LOGO_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "This file is over 2 MB. Please upload a smaller logo." }, { status: 413 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: "This file is over 2 MB. Please upload a smaller logo." }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    let saved;
    try {
      saved = await saveCompanyLogo(id, buf);
    } catch (err) {
      if (err instanceof LogoError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    if (!saved) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    await logAdminAction(user!, "COMPANY_LOGO_UPDATED", {
      targetType: "Company",
      targetId: id,
      metadata: { action: "upload", bytes: buf.length },
    });

    return NextResponse.json({
      logoUrl: logoPublicPath(id, saved.logoWebKey),
      logoLuminance: saved.logoLuminance,
      logoWidth: saved.logoWidth,
      logoHeight: saved.logoHeight,
    });
  } catch (err) {
    console.error("POST /api/companies/[id]/logo error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    await removeCompanyLogo(id);
    await logAdminAction(user!, "COMPANY_LOGO_UPDATED", {
      targetType: "Company",
      targetId: id,
      metadata: { action: "remove" },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/companies/[id]/logo error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
