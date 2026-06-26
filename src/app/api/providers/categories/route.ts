export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const categories = await db.serviceCategory.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(categories);
}
