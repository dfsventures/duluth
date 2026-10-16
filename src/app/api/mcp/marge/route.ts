export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { margeMcpMode, verifyAssertion, claimJti, resolvePrincipal } from "@/lib/marge-auth";
import { margeHandler, auditDenied, type MargeCall } from "@/lib/marge-tools/server";
import { MARGE_TOOLS } from "@/lib/marge-tools/tiers";

// Part 39 (WS123). Public in route-access.ts for exactly this path; the signed assertion is the
// real gate. Order matters: the kill switch, then the body size, then the signature, and only
// then (for tools/call) any database access.

const MAX_BODY = 64_000;

const PRINCIPAL_MESSAGES = {
  unknown_user: "Molly doesn't know your Google account. Sign in to molly.dfs.vc with Google once.",
  identity_conflict: "Molly can't match your Google account to your Molly user. Ask an admin to check it.",
  not_admin: "You don't have admin access in Molly.",
  not_approved: "You don't have admin access in Molly.",
  domain: "You don't have admin access in Molly.",
} as const;

/** JSON-RPC form of a tool error, so Marge can show the sentence as-is. */
function toolErrorResponse(body: unknown, text: string) {
  const id = (body as { id?: unknown })?.id ?? null;
  return Response.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } });
}

export async function POST(req: Request) {
  if (margeMcpMode() === "off") return Response.json({ error: "Not found" }, { status: 404 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "Too large" }, { status: 413 });

  const v = await verifyAssertion(req.headers.get("authorization")); // no DB access before this line
  if (!v.ok) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (Array.isArray(body)) return Response.json({ error: "Batch not supported" }, { status: 400 }); // JC-MG-A

  let extra: MargeCall | undefined;
  if ((body as { method?: unknown })?.method === "tools/call") {
    if (!(await claimJti(v.claims))) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const who = await resolvePrincipal(v.claims);
    if (!who.ok) {
      const name = (body as { params?: { name?: unknown } })?.params?.name;
      const tool = typeof name === "string" && name in MARGE_TOOLS ? name : "unknown";
      await auditDenied({ email: v.claims.email }, v.claims, tool, who.reason);
      return toolErrorResponse(body, PRINCIPAL_MESSAGES[who.reason]);
    }
    extra = { claims: v.claims, principal: who.user };
  }

  return margeHandler.fetch(new Request(req.url, { method: "POST", headers: req.headers, body: raw }), {
    authInfo: { token: "", clientId: "marge", scopes: [v.claims.scope], extra },
    parsedBody: body,
  });
}

export async function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
