// Part 39 (WS120). The argument hash both repos compute. This text is the contract shared with
// Marge (docs/IMPLEMENTATION_PLAN.md, "The contract shared with Marge"); keep it byte-compatible.
import crypto from "crypto";

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

export function argsHash(args: Record<string, unknown>): string {
  const { dryRun: _ignored, ...rest } = args;
  return crypto.createHash("sha256").update(canonicalJson(rest)).digest("hex");
}
