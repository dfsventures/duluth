import crypto from "crypto";

/** Single source of truth for setup-link lifetime (Q19-B; was 48h hardcoded at 3 sites). */
export const SETUP_TOKEN_TTL_DAYS = 7;

export function generateSetupToken() {
  return {
    token: crypto.randomBytes(32).toString("hex"),
    tokenExpiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

/** Null expiry counts as EXPIRED (the stricter of the two semantics that existed; see Part 9 notes). */
export function isSetupTokenExpired(u: { tokenExpiresAt: Date | null }): boolean {
  return !u.tokenExpiresAt || u.tokenExpiresAt < new Date();
}

/**
 * Who may be (re)issued a setup link. Written against the real state machine (F19):
 * an admin-approved signup founder is PENDING + token; an invited user is APPROVED + token.
 * PENDING with no token = still awaiting admin approval — must NOT be able to mint a link.
 */
export function canResendSetupLink(u: {
  passwordHash: string | null;
  status: string;
  approvalToken: string | null;
}): boolean {
  if (u.passwordHash) return false;
  if (u.status === "REJECTED") return false;
  return u.status === "APPROVED" || u.approvalToken !== null;
}
