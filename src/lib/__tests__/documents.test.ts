import { describe, it, expect } from "vitest";
import { isInlineViewable } from "@/lib/documents";

// Part 19, WS45 (JC-VD-B) — the inline-viewable allowlist is PDF + the
// four raster image types only. Everything else, including plausible
// browser-renderable types not asked for (text/plain, video), stays out
// of v1.

describe("isInlineViewable", () => {
  it.each([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ])("returns true for %s", (mimeType) => {
    expect(isInlineViewable(mimeType)).toBe(true);
  });

  it.each([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "video/mp4",
    "text/plain",
    "application/octet-stream",
  ])("returns false for %s", (mimeType) => {
    expect(isInlineViewable(mimeType)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isInlineViewable(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isInlineViewable(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isInlineViewable("")).toBe(false);
  });

  it("is case-insensitive, matching the lowercasing convention in POST /api/documents/upload", () => {
    expect(isInlineViewable("IMAGE/PNG")).toBe(true);
    expect(isInlineViewable("Application/PDF")).toBe(true);
  });
});
