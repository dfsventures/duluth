// Part 40 (WS126). Tiny helpers shared by the memo API routes.
import { NextResponse } from "next/server";
import type { MemoResult } from "@/lib/memo-actions";

export function memoResponse<T>(r: MemoResult<T>, okStatus = 200) {
  return r.ok ? NextResponse.json(r.value, { status: okStatus }) : NextResponse.json({ error: r.error }, { status: r.status });
}

/** A JSON object body, or null. */
export async function readObjectBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export const memoSummarySelect = {
  id: true,
  title: true,
  companyId: true,
  companyNamePending: true,
  status: true,
  visibility: true,
  draftedByMarge: true,
  source: true,
  decision: true,
  tags: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, email: true } },
} as const;
