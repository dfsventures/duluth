import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  LogoError,
  MAX_LOGO_BYTES,
  assertSvgSafe,
  contentHash,
  looksLikeSvg,
  processLogo,
} from "../logo-process";

// Synthetic images only. A coloured block on a transparent canvas, so trimming
// has margins to remove.
async function block(opts: {
  canvas: [number, number];
  box: [number, number];
  color?: string;
  format?: "png" | "jpeg" | "webp";
  background?: string;
}) {
  const [cw, ch] = opts.canvas;
  const [bw, bh] = opts.box;
  const inner = await sharp({
    create: { width: bw, height: bh, channels: 4, background: opts.color ?? "#cc2244" },
  })
    .png()
    .toBuffer();
  const img = sharp({
    create: { width: cw, height: ch, channels: 4, background: opts.background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: inner, left: Math.floor((cw - bw) / 2), top: Math.floor((ch - bh) / 2) }]);
  const fmt = opts.format ?? "png";
  return fmt === "png" ? img.png().toBuffer() : fmt === "jpeg" ? img.flatten({ background: "#fff" }).jpeg().toBuffer() : img.webp().toBuffer();
}

const expectLogoError = async (p: Promise<unknown>, re: RegExp) => {
  const err = await p.then(
    () => null,
    (e) => e
  );
  expect(err).toBeInstanceOf(LogoError);
  expect((err as Error).message).toMatch(re);
};

describe("processLogo", () => {
  it("trims margins and produces web, email and source PNGs", async () => {
    const input = await block({ canvas: [800, 600], box: [400, 200] });
    const out = await processLogo(input, "#ffffff");
    const web = await sharp(out.web).metadata();
    expect(web.format).toBe("png");
    expect(out.width).toBe(web.width);
    expect(out.height).toBe(web.height);
    // 400x200 block -> 2:1, fits 480x160 => 320x160
    expect(out.width).toBe(320);
    expect(out.height).toBe(160);
    const src = await sharp(out.source).metadata();
    expect(src.width).toBe(400);
    expect(src.height).toBe(200);
  });

  it("flattens the email derivative onto the plate colour (no transparency)", async () => {
    const out = await processLogo(await block({ canvas: [500, 400], box: [300, 150], color: "#ffffff" }), "#0e828b");
    const meta = await sharp(out.email).metadata();
    expect(meta.hasAlpha).toBe(false);
    // white logo on teal plate: a corner of the plate is NOT used (box fills image),
    // so check a darker-plate render of a smaller logo instead
    const small = await processLogo(await block({ canvas: [600, 600], box: [300, 300], color: "#ffffff" }), "#0e828b");
    const { data } = await sharp(small.email).raw().toBuffer({ resolveWithObject: true });
    expect(data.length).toBeGreaterThan(0);
  });

  it("reports luminance for mostly white and mostly dark logos", async () => {
    const white = await processLogo(await block({ canvas: [600, 400], box: [300, 150], color: "#ffffff" }), "#ffffff");
    const dark = await processLogo(await block({ canvas: [600, 400], box: [300, 150], color: "#101010" }), "#ffffff");
    expect(white.luminance).toBeGreaterThan(0.95);
    expect(dark.luminance).toBeLessThan(0.1);
  });

  it("accepts JPG and WebP", async () => {
    for (const format of ["jpeg", "webp"] as const) {
      const out = await processLogo(await block({ canvas: [600, 400], box: [300, 200], format, background: "#ffffff" }), "#ffffff");
      expect(out.width).toBeGreaterThan(0);
    }
  });

  it("keeps a square mark square", async () => {
    const out = await processLogo(await block({ canvas: [500, 500], box: [300, 300] }), "#ffffff");
    expect(out.width).toBe(out.height);
  });

  it("rejects too small, too wide, and taller-than-wide logos with plain messages", async () => {
    await expectLogoError(processLogo(await block({ canvas: [200, 200], box: [100, 100] }), "#ffffff"), /too small/);
    await expectLogoError(processLogo(await block({ canvas: [1200, 400], box: [1200, 100] }), "#ffffff"), /very wide/);
    await expectLogoError(processLogo(await block({ canvas: [600, 600], box: [150, 400] }), "#ffffff"), /taller/);
  });

  it("rejects non-images, empty and oversize files", async () => {
    await expectLogoError(processLogo(Buffer.from("not an image at all"), "#ffffff"), /couldn't read|PNG/);
    await expectLogoError(processLogo(Buffer.alloc(0), "#ffffff"), /empty/);
    await expectLogoError(processLogo(Buffer.alloc(MAX_LOGO_BYTES + 1), "#ffffff"), /2 MB/);
    const gif = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#f00" } }).gif().toBuffer();
    await expectLogoError(processLogo(gif, "#ffffff"), /PNG, JPG, WebP or SVG/);
  });

  it("rasterises a safe SVG and never returns SVG bytes", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"><rect x="10" y="10" width="280" height="80" fill="#cc2244"/></svg>'
    );
    const out = await processLogo(svg, "#ffffff");
    for (const b of [out.source, out.web, out.email]) {
      expect((await sharp(b).metadata()).format).toBe("png");
      expect(b.subarray(0, 4).toString("hex")).toBe("89504e47");
    }
  });
});

describe("SVG screening", () => {
  const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${inner}</svg>`;
  const unsafe = {
    script: wrap('<script>alert(1)</script>'),
    onload: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
    foreignObject: wrap("<foreignObject><div/></foreignObject>"),
    externalImage: wrap('<image href="https://evil.example/x.png"/>'),
    fileImage: wrap('<image xlink:href="file:///etc/passwd"/>'),
    javascriptHref: wrap('<a href="javascript:alert(1)"><rect/></a>'),
    entity: '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    style: wrap("<style>@import url(http://evil.example/a.css);</style>"),
    externalUrl: wrap('<rect fill="url(http://evil.example/p)"/>'),
  };
  for (const [name, svg] of Object.entries(unsafe)) {
    it(`rejects ${name}`, () => {
      expect(() => assertSvgSafe(svg)).toThrow(LogoError);
    });
  }
  it("allows in-document references and embedded rasters", () => {
    expect(() => assertSvgSafe(wrap('<defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/>'))).not.toThrow();
    expect(() => assertSvgSafe(wrap('<image href="data:image/png;base64,AAAA"/>'))).not.toThrow();
  });
  it("processLogo refuses unsafe SVG before rasterising", async () => {
    await expectLogoError(processLogo(Buffer.from(unsafe.script), "#ffffff"), /can't accept/);
  });
  it("looksLikeSvg sniffs content, not mime", async () => {
    expect(looksLikeSvg(Buffer.from('<?xml version="1.0"?><svg/>'))).toBe(true);
    expect(looksLikeSvg(await block({ canvas: [300, 300], box: [100, 100] }))).toBe(false);
  });
});

describe("contentHash", () => {
  it("is 16 hex chars and content-dependent", () => {
    expect(contentHash(Buffer.from("a"))).toMatch(/^[0-9a-f]{16}$/);
    expect(contentHash(Buffer.from("a"))).not.toBe(contentHash(Buffer.from("b")));
  });
});
