import { describe, it, expect } from "vitest";
import { normalizeSettingsTab, settingsTabHref } from "@/app/admin/settings/settings-tabs-util";

describe("normalizeSettingsTab", () => {
  it("accepts the three known tabs", () => {
    expect(normalizeSettingsTab("email")).toBe("email");
    expect(normalizeSettingsTab("storage")).toBe("storage");
    expect(normalizeSettingsTab("integrations")).toBe("integrations");
  });
  it("falls back to email for missing or unknown values", () => {
    expect(normalizeSettingsTab(undefined)).toBe("email");
    expect(normalizeSettingsTab("")).toBe("email");
    expect(normalizeSettingsTab("nope")).toBe("email");
    expect(normalizeSettingsTab(["storage", "email"])).toBe("storage");
  });
  it("builds hrefs, leaving the default tab on the bare path", () => {
    expect(settingsTabHref("email")).toBe("/admin/settings");
    expect(settingsTabHref("storage")).toBe("/admin/settings?tab=storage");
  });
});
