export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { LP_COOKIE } from "@/lib/lp-auth";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(LP_COOKIE)?.value;
    if (token) {
      await db.lpSession.deleteMany({ where: { token } });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(LP_COOKIE);
    return response;
  } catch (err) {
    console.error("POST /api/lp/auth/logout error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
