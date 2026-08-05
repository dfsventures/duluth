export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { objectExists } from "@/lib/s3";

// Caps concurrent HeadObject calls so a large Document table doesn't open
// hundreds of simultaneous requests against S3/R2 in one scan.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const documents = await db.document.findMany({
      select: {
        id: true,
        name: true,
        s3Key: true,
        createdAt: true,
        archivedAt: true,
        company: { select: { name: true } },
        uploadedBy: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const checked = await mapWithConcurrency(documents, 10, async (doc) => ({
      doc,
      exists: await objectExists(doc.s3Key),
    }));

    const orphaned = checked.filter((c) => !c.exists).map((c) => c.doc);
    return NextResponse.json({ scanned: documents.length, orphaned });
  } catch (err) {
    console.error("POST /api/admin/documents/orphan-scan error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
