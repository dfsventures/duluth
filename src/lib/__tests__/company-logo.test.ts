import { describe, it, expect } from "vitest";
import { logoKey, logoPublicPath, parsePublicLogoPath } from "../company-logo";

const H = "0123456789abcdef";
const ID = "ckabc1234567890abcdef";

describe("company logo keys", () => {
  it("builds a public path from a stored derivative key", () => {
    const key = logoKey(ID, H, "web");
    expect(key).toBe(`companies/${ID}/logo/${H}-web.png`);
    expect(logoPublicPath(ID, key)).toBe(`/api/logo/${ID}/${H}-web.png`);
  });
  it("returns null for missing, foreign or malformed keys", () => {
    expect(logoPublicPath(ID, null)).toBeNull();
    expect(logoPublicPath(ID, logoKey("ckother1234567890abcd", H, "web"))).toBeNull();
    expect(logoPublicPath(ID, `companies/${ID}/logo/${H}-source.png`)).toBeNull();
    expect(logoPublicPath(ID, "https://evil.example/x.png")).toBeNull();
  });
  it("parses only well-formed public paths", () => {
    expect(parsePublicLogoPath(ID, `${H}-email.png`)).toEqual({
      key: `companies/${ID}/logo/${H}-email.png`,
      variant: "email",
    });
    for (const [id, f] of [
      [ID, `${H}-source.png`],
      [ID, `${H}-web.svg`],
      [ID, `../${H}-web.png`],
      [ID, "short-web.png"],
      ["../etc", `${H}-web.png`],
      ["a/b", `${H}-web.png`],
    ] as const) {
      expect(parsePublicLogoPath(id, f)).toBeNull();
    }
  });
});
