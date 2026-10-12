import { createHash } from "crypto";
import sharp, { type OutputInfo } from "sharp";

/**
 * Logo upload processing (company update theming, section 4).
 *
 * Uploaded bytes are never served. We decode them, trim the margins, and emit
 * PNG derivatives we generated ourselves. SVG sources are screened and then
 * rasterised; the SVG itself is discarded. Node-only (sharp).
 */

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MIN_LOGO_EDGE = 256;
export const MAX_ASPECT = 6; // wider than 6:1 is rejected
export const MIN_ASPECT = 0.9; // taller than wide is rejected (a little slack for square marks)
const WEB_BOX = { width: 480, height: 160 };
const SOURCE_EDGE = 1200;
const MAX_INPUT_PIXELS = 25_000_000;

export class LogoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoError";
  }
}

export interface ProcessedLogo {
  source: Buffer; // trimmed PNG, capped at 1200px
  web: Buffer; // fit inside 480x160
  email: Buffer; // same box, flattened onto the plate colour
  width: number; // web derivative size
  height: number;
  luminance: number | null; // mean luminance of opaque pixels, 0..1
}

export function contentHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/** True when the leading bytes look like an SVG/XML document rather than a raster. */
export function looksLikeSvg(buf: Buffer): boolean {
  const head = buf.subarray(0, 2048).toString("utf8").replace(/^﻿/, "").trimStart().toLowerCase();
  return head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!doctype svg") || head.startsWith("<!--");
}

const SVG_REJECT: RegExp[] = [
  /<\s*script/i,
  /<\s*foreignObject/i,
  /<\s*iframe/i,
  /<\s*embed/i,
  /<\s*object/i,
  /<\s*style/i, // can @import external resources
  /<!ENTITY/i,
  /<!DOCTYPE[^>]*\[/i,
  /\son[a-z]+\s*=/i, // event handlers
  /javascript:/i,
  /@import/i,
  // any href that is not an in-document #fragment or an embedded raster
  /(?:xlink:)?href\s*=\s*["'](?!#|data:image\/(?:png|jpe?g|webp);base64,)/i,
  // any url() that is not an in-document #fragment
  /url\(\s*["']?(?!#)/i,
];

/** Throws LogoError for an SVG we will not hand to the rasteriser. */
export function assertSvgSafe(svg: string): void {
  if (SVG_REJECT.some((re) => re.test(svg))) {
    throw new LogoError(
      "This SVG uses features we can't accept (scripts, styles or links to other files). Export your logo as a PNG instead."
    );
  }
}

async function toRasterPng(input: Buffer): Promise<Buffer> {
  if (looksLikeSvg(input)) {
    assertSvgSafe(input.toString("utf8"));
    let meta;
    try {
      meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    } catch {
      throw new LogoError("We couldn't read that SVG. Try exporting it again or upload a PNG.");
    }
    const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (!edge) throw new LogoError("We couldn't read that SVG. Try exporting it again or upload a PNG.");
    const density = Math.min(2400, Math.max(72, Math.round((72 * SOURCE_EDGE) / edge)));
    try {
      return await sharp(input, { density, limitInputPixels: MAX_INPUT_PIXELS }).png().toBuffer();
    } catch {
      throw new LogoError("We couldn't read that SVG. Try exporting it again or upload a PNG.");
    }
  }

  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new LogoError("We couldn't read that image. Please upload a PNG, JPG, WebP or SVG.");
  }
  if (!meta.format || !["png", "jpeg", "webp"].includes(meta.format)) {
    throw new LogoError("Please upload a PNG, JPG, WebP or SVG.");
  }
  if (Math.max(meta.width ?? 0, meta.height ?? 0) < MIN_LOGO_EDGE) {
    throw new LogoError(`This logo is too small. Please upload one at least ${MIN_LOGO_EDGE}px on its longest side.`);
  }
  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().ensureAlpha().png().toBuffer();
  } catch {
    throw new LogoError("We couldn't read that image. Please upload a PNG, JPG, WebP or SVG.");
  }
}

export async function renderEmailLogo(source: Buffer, plateHex: string): Promise<Buffer> {
  return sharp(source)
    .resize({ ...WEB_BOX, fit: "inside", withoutEnlargement: true })
    .flatten({ background: plateHex })
    .png()
    .toBuffer();
}

async function meanLuminance(png: Buffer): Promise<number | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] <= 128) continue;
    sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    n++;
  }
  return n > 0 ? sum / n : null;
}

/** Validate, trim and derive. Throws LogoError with a founder-readable message. */
export async function processLogo(input: Buffer, plateHex: string): Promise<ProcessedLogo> {
  if (input.length === 0) throw new LogoError("That file is empty.");
  if (input.length > MAX_LOGO_BYTES) throw new LogoError("This file is over 2 MB. Please upload a smaller logo.");

  const raster = await toRasterPng(input);

  let trimmed: { data: Buffer; info: OutputInfo };
  try {
    trimmed = await sharp(raster).trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true });
  } catch {
    throw new LogoError("We couldn't find a logo in that image. Please upload a different file.");
  }
  const { width, height } = trimmed.info;
  if (width < 8 || height < 8) {
    throw new LogoError("We couldn't find a logo in that image. Please upload a different file.");
  }
  const aspect = width / height;
  if (aspect > MAX_ASPECT) {
    throw new LogoError(
      "This logo is very wide. Add some space above and below, or upload a version with less empty space."
    );
  }
  if (aspect < MIN_ASPECT) {
    throw new LogoError("This logo is taller than it is wide. Please upload a square or wide version of it.");
  }

  const source = await sharp(trimmed.data)
    .resize({ width: SOURCE_EDGE, height: SOURCE_EDGE, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const web = await sharp(source)
    .resize({ ...WEB_BOX, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const email = await renderEmailLogo(source, plateHex);

  return {
    source,
    web: web.data,
    email,
    width: web.info.width,
    height: web.info.height,
    luminance: await meanLuminance(web.data),
  };
}
