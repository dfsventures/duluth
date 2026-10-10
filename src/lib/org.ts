// Fork-facing configuration. All values have DFS defaults so an
// unconfigured deploy behaves exactly as before.
// NEXT_PUBLIC_ vars are inlined at BUILD time — changing them requires a redeploy.

/** Organization display name, used in UI copy, page titles, and emails. */
export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || "DFS";

/** Email domains granted admin access via Google OAuth. The env var takes a
 *  comma-separated list (e.g. "dfs.vc,example.org"); a leading "@" on any
 *  entry is ignored. */
export const ADMIN_EMAIL_DOMAINS: string[] = (
  process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN || "dfs.vc"
)
  .split(",")
  .map((d) => d.trim().replace(/^@/, "").toLowerCase())
  .filter(Boolean);

/** The first allowed domain, kept for single-domain callers. */
export const ADMIN_EMAIL_DOMAIN = ADMIN_EMAIL_DOMAINS[0] ?? "dfs.vc";

/** "@a.com" or "@a.com or @b.com" (or "@a.com, @b.com or @c.com"), for UI copy. */
export const ADMIN_EMAIL_DOMAINS_LABEL = (() => {
  const at = ADMIN_EMAIL_DOMAINS.map((d) => `@${d}`);
  return at.length <= 1 ? at.join("") : `${at.slice(0, -1).join(", ")} or ${at[at.length - 1]}`;
})();

/** True when the email's domain is exactly one of the allowed admin domains. */
export function isAdminEmailDomain(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return ADMIN_EMAIL_DOMAINS.includes(domain);
}

/** Logo image shown in the LP portal header. Server-side only (the LP
 *  layout is a Server Component), so no NEXT_PUBLIC_ prefix and no rebuild
 *  needed to change it. Mirrors EMAIL_LOGO_PATH in src/lib/email.ts. */
export const ORG_LOGO_PATH = process.env.ORG_LOGO_PATH || "/brand/dfs-logo-primary.png";
