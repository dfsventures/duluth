export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth-guard";
import { getUploadUrl } from "@/lib/s3";

export async function POST() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const key = `_health-check/${randomUUID()}.txt`;
    const uploadUrl = await getUploadUrl(key, "text/plain");
    return NextResponse.json({ uploadUrl, key });
  } catch (err) {
    console.error("POST /api/admin/storage/test-upload error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
