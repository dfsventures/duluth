import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn keeps the named type roles", () => {
  it("does not drop text-cta / tracking-cta when a text colour follows", () => {
    const out = cn("font-mono text-cta tracking-cta", "text-primary-foreground");
    expect(out).toContain("text-cta");
    expect(out).toContain("tracking-cta");
    expect(out).toContain("text-primary-foreground");
  });

  it("does not drop text-label next to a colour", () => {
    expect(cn("text-label", "text-muted-foreground")).toBe("text-label text-muted-foreground");
  });

  it("still lets a later size override an earlier one", () => {
    expect(cn("text-label", "text-sm")).toBe("text-sm");
    expect(cn("text-sm", "text-cta")).toBe("text-cta");
  });
});
