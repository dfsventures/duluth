export const SETTINGS_TABS = [
  { value: "email", label: "Email & digest" },
  { value: "storage", label: "Storage" },
  { value: "integrations", label: "Integrations" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

/** Unknown or missing ?tab= falls back to the default tab (never a 404). */
export function normalizeSettingsTab(raw?: string | string[] | null): SettingsTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return SETTINGS_TABS.find((t) => t.value === v)?.value ?? "email";
}

export function settingsTabHref(tab: SettingsTab): string {
  return tab === "email" ? "/admin/settings" : `/admin/settings?tab=${tab}`;
}

