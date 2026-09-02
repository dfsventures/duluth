// Fork-facing configuration. All values have DFS defaults so an
// unconfigured deploy behaves exactly as before.
// NEXT_PUBLIC_ vars are inlined at BUILD time — changing them requires a redeploy.

/** Organization display name, used in UI copy, page titles, and emails. */
export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || "DFS";

/** Email domain granted admin access via Google OAuth (no leading "@"). */
export const ADMIN_EMAIL_DOMAIN = (
  process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN || "dfs.vc"
).replace(/^@/, "");

/** Logo image shown in the LP portal header. Server-side only (the LP
 *  layout is a Server Component), so no NEXT_PUBLIC_ prefix and no rebuild
 *  needed to change it. Mirrors EMAIL_LOGO_PATH in src/lib/email.ts. */
export const ORG_LOGO_PATH = process.env.ORG_LOGO_PATH || "/brand/dfs-logo-primary.png";
