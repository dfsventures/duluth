"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareThemePreview } from "@/components/share/share-theme-preview";
import {
  DEFAULT_BRAND_HEX,
  brandingNotices,
  deriveTheme,
  describeBranding,
  normalizeBrandHex,
  type LogoPlate,
} from "@/lib/brand-theme";
import { cn } from "@/lib/utils";

export interface BrandingValues {
  /** Stored hex; null = Molly default. */
  brandColor: string | null;
  logoPlate: LogoPlate;
}

interface Props {
  companyId: string;
  companyName: string;
  initial: BrandingValues;
  logoUrl: string | null;
  logoLuminance: number | null;
  logoSquare?: boolean;
  onSaved?: (v: BrandingValues) => void;
}

const asField = (hex: string | null) => (hex ?? DEFAULT_BRAND_HEX).toUpperCase();

export function BrandingCard({ companyId, companyName, initial, logoUrl, logoLuminance, logoSquare, onSaved }: Props) {
  const [saved, setSaved] = useState<BrandingValues>(initial);
  const [text, setText] = useState(asField(initial.brandColor));
  const [plate, setPlate] = useState<LogoPlate>(initial.logoPlate);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const normalized = normalizeBrandHex(text);
  const invalid = text.trim() !== "" && !normalized;
  // Empty or default colour => null (the Molly default); invalid keeps the last good preview.
  const effective = invalid ? saved.brandColor : normalized === DEFAULT_BRAND_HEX || !normalized ? null : normalized;
  const theme = effective ? deriveTheme(effective) : null;
  const shown = theme ?? deriveTheme(DEFAULT_BRAND_HEX);
  const dirty = !invalid && (effective !== saved.brandColor || plate !== saved.logoPlate);
  const notices = brandingNotices(effective, plate, logoLuminance);
  const usingDefault = effective === null;

  function commitText() {
    if (normalized) setText(normalized.toUpperCase());
  }

  async function save() {
    if (invalid || !dirty) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandColor: effective, logoPlate: plate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to save branding");
      }
      const next: BrandingValues = { brandColor: effective, logoPlate: plate };
      setSaved(next);
      onSaved?.(next);
      setStatus({ type: "ok", text: "Branding saved. Your next share page will use it." });
    } catch (err) {
      setStatus({ type: "error", text: err instanceof Error ? err.message : "Failed to save branding" });
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setText(asField(saved.brandColor));
    setPlate(saved.logoPlate);
    setStatus(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investor update branding</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Your logo and one accent colour appear on the pages investors open. We adjust shades where needed so
          text stays easy to read.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="space-y-5">
            <div>
              <p className="label">Logo sits on</p>
              <div className="mt-1 inline-flex rounded-ctl border border-edge p-0.5" role="group" aria-label="Logo background">
                {(["LIGHT", "BRAND"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={plate === p}
                    onClick={() => setPlate(p)}
                    className={cn(
                      "rounded-[inherit] px-3 py-1.5 text-[13px] font-medium transition-colors",
                      plate === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {p === "LIGHT" ? "White" : "Your colour"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="brand-hex" className="label">Accent colour</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick accent colour"
                  value={(normalized ?? effective ?? DEFAULT_BRAND_HEX).toLowerCase()}
                  onChange={(e) => setText(e.target.value.toUpperCase())}
                  className="h-10 w-11 shrink-0 cursor-pointer rounded-ctl border border-edge bg-transparent p-0.5"
                />
                <input
                  id="brand-hex"
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={commitText}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitText();
                    }
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={invalid || undefined}
                  aria-describedby="brand-hex-msg"
                  className={cn("input-field w-32 font-mono", invalid && "border-destructive")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setText(asField(null))}
                  disabled={usingDefault && !invalid}
                >
                  Reset to default
                </Button>
              </div>
              <p id="brand-hex-msg" className={cn("mt-1 text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>
                {invalid
                  ? "Enter 3 or 6 hex digits, for example 12A5B0."
                  : usingDefault
                    ? "Using the Molly default blue."
                    : "You can type a hex code like abc, #abc or aabbcc."}
              </p>
            </div>

            {notices.length > 0 && (
              <div role="status" className="space-y-1.5">
                {notices.map((n) => (
                  <p key={n} className="rounded-md bg-tone-sand px-3 py-2 text-xs text-tone-sand-ink">{n}</p>
                ))}
              </div>
            )}

            <div>
              <p className="label">How we use it</p>
              <ul className="mt-1.5 space-y-2">
                {describeBranding(shown).map((row) => (
                  <li key={row.label} className="flex items-start gap-2.5 text-xs">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-black/15"
                      style={{ backgroundColor: row.swatch }}
                    />
                    <span>
                      <span className="font-medium text-foreground">{row.label}.</span>{" "}
                      <span className="text-muted-foreground">{row.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={save} disabled={!dirty || saving} loading={saving}>
                <Save className="mr-2 h-4 w-4" />
                Save branding
              </Button>
              {dirty && (
                <Button type="button" variant="secondary" onClick={cancel} disabled={saving}>
                  Cancel
                </Button>
              )}
              {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            </div>
            {status && (
              <p role="status" className={cn("text-xs", status.type === "ok" ? "text-tone-sage-ink" : "text-destructive")}>
                {status.text}
              </p>
            )}
          </div>

          <div>
            <p className="label">Preview</p>
            <div className="mt-1">
              <ShareThemePreview name={companyName} theme={theme} plate={plate} logoUrl={logoUrl} square={logoSquare} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Nothing reaches investors until you save.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
