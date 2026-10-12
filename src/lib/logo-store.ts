import { db } from "@/lib/db";
import { getObjectBuffer, putObject } from "@/lib/s3";
import { deriveTheme, normalizeLogoPlate, plateColor, DEFAULT_BRAND_HEX, normalizeBrandHex } from "@/lib/brand-theme";
import { contentHash, processLogo, renderEmailLogo } from "@/lib/logo-process";
import { logoKey } from "@/lib/company-logo";

function plateHexFor(brandColor: string | null, plate: string | null): string {
  const theme = deriveTheme(normalizeBrandHex(brandColor) ?? DEFAULT_BRAND_HEX);
  return plateColor(theme, normalizeLogoPlate(plate) ?? "LIGHT");
}

/**
 * Process an uploaded logo and store the three PNGs. Old objects are kept on
 * purpose: URLs are content-hashed, and an email sent last month must keep
 * rendering the logo it was sent with.
 */
export async function saveCompanyLogo(companyId: string, input: Buffer) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { brandColor: true, logoPlate: true },
  });
  if (!company) return null;

  const out = await processLogo(input, plateHexFor(company.brandColor, company.logoPlate));
  const sourceKey = logoKey(companyId, contentHash(out.source), "source");
  const webKey = logoKey(companyId, contentHash(out.web), "web");
  const emailKey = logoKey(companyId, contentHash(out.email), "email");

  await Promise.all([
    putObject(sourceKey, out.source, "image/png"),
    putObject(webKey, out.web, "image/png"),
    putObject(emailKey, out.email, "image/png"),
  ]);

  const updated = await db.company.update({
    where: { id: companyId },
    data: {
      logo: sourceKey,
      logoWebKey: webKey,
      logoEmailKey: emailKey,
      logoLuminance: out.luminance,
      logoWidth: out.width,
      logoHeight: out.height,
    },
    select: { logoWebKey: true, logoLuminance: true, logoWidth: true, logoHeight: true, logoPlate: true },
  });
  return updated;
}

export async function removeCompanyLogo(companyId: string) {
  return db.company.update({
    where: { id: companyId },
    data: { logo: null, logoWebKey: null, logoEmailKey: null, logoLuminance: null, logoWidth: null, logoHeight: null },
    select: { id: true },
  });
}

/**
 * Re-flatten the email derivative onto the current plate colour after a plate
 * or accent change. Returns the new key, or null when there is no logo.
 */
export async function refreshEmailLogo(companyId: string): Promise<string | null> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { logo: true, brandColor: true, logoPlate: true },
  });
  if (!company?.logo) return null;
  const source = await getObjectBuffer(company.logo);
  if (!source) return null;
  const email = await renderEmailLogo(source, plateHexFor(company.brandColor, company.logoPlate));
  const key = logoKey(companyId, contentHash(email), "email");
  await putObject(key, email, "image/png");
  await db.company.update({ where: { id: companyId }, data: { logoEmailKey: key } });
  return key;
}
