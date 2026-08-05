export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { objectExists, deleteObject } from "@/lib/s3";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const { key } = await request.json();
    if (typeof key !== "string" || !key.startsWith("_health-check/")) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    try {
      const exists = await objectExists(key);
      if (!exists) {
        await logAdminAction(user!, "STORAGE_TEST_UPLOAD_FAILED", {
          metadata: { key, reason: "object not found after PUT" },
        });
        return NextResponse.json(
          { error: "The browser's upload never reached storage — check S3/R2 credentials and CORS policy." },
          { status: 502 }
        );
      }
      await deleteObject(key);
      await logAdminAction(user!, "STORAGE_TEST_UPLOAD_SUCCEEDED", { metadata: { key } });
      return NextResponse.json({ success: true });
    } catch (err) {
      await logAdminAction(user!, "STORAGE_TEST_UPLOAD_FAILED", {
        metadata: { key, reason: err instanceof Error ? err.message : "unknown" },
      });
      return NextResponse.json({ error: "Could not verify or clean up the test object." }, { status: 500 });
    }
  } catch (err) {
    console.error("POST /api/admin/storage/test-upload/confirm error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
