// Fork-facing configuration. All values have DFS Lab defaults so an
// unconfigured deploy behaves exactly as before.
// NEXT_PUBLIC_ vars are inlined at BUILD time — changing them requires a redeploy.

/** Organization display name, used in UI copy, page titles, and emails. */
export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || "DFS Lab";

/** Email domain granted admin access via Google OAuth (no leading "@"). */
export const ADMIN_EMAIL_DOMAIN = (
  process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN || "dfs.vc"
).replace(/^@/, "");
