export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getObjectBuffer } from "@/lib/s3";
import { parsePublicLogoPath } from "@/lib/company-logo";

/**
 * Public, session-less logo derivatives (share page and, later, email headers).
 * Serves ONLY `companies/{id}/logo/{hash16}-{web|email}.png`, validated by
 * parsePublicLogoPath, so nothing else in the bucket is reachable. The URL
 * carries a content hash, hence the immutable cache header. The bytes are PNGs
 * we generated, never uploaded SVG.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; file: string }> }
) {
  try {
    const { companyId, file } = await params;
    const parsed = parsePublicLogoPath(companyId, file);
    if (!parsed) return new NextResponse("Not found", { status: 404 });

    const body = await getObjectBuffer(parsed.key);
    if (!body) return new NextResponse("Not found", { status: 404 });

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    console.error("GET /api/logo error:", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
