// Pure helpers for company logo keys and public URLs. Derivative keys have the
// shape `companies/{companyId}/logo/{hash16}-{web|email|source}.png`; the hash
// is a content hash, so a URL never changes meaning and can be cached forever
// (and an email sent last year keeps rendering the logo it was sent with).

export type LogoVariant = "web" | "email";

const FILE_RE = /^([0-9a-f]{16})-(web|email)\.png$/;
// Company ids are cuids; accept any conservative id-like segment.
const COMPANY_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;

export function logoKeyPrefix(companyId: string): string {
  return `companies/${companyId}/logo/`;
}

export function logoKey(companyId: string, hash: string, variant: "web" | "email" | "source"): string {
  return `${logoKeyPrefix(companyId)}${hash}-${variant}.png`;
}

/** Public path (not absolute) for a stored derivative key, or null. */
export function logoPublicPath(companyId: string, key: string | null | undefined): string | null {
  if (!key) return null;
  const file = key.slice(key.lastIndexOf("/") + 1);
  if (!FILE_RE.test(file) || !key.startsWith(logoKeyPrefix(companyId))) return null;
  return `/api/logo/${companyId}/${file}`;
}

/** Validate the two URL segments of the public route and return the S3 key. */
export function parsePublicLogoPath(companyId: string, file: string): { key: string; variant: LogoVariant } | null {
  if (!COMPANY_ID_RE.test(companyId)) return null;
  const m = FILE_RE.exec(file);
  if (!m) return null;
  return { key: `${logoKeyPrefix(companyId)}${file}`, variant: m[2] as LogoVariant };
}
