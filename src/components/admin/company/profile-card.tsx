"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Building2, ExternalLink, Globe, MapPin, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectorCombobox } from "@/components/ui/sector-combobox";
import { normalizeUrl } from "@/lib/utils";
import type { FlashMessage } from "@/lib/use-flash-message";
import { FUNDING_STAGES, REMINDER_OPTIONS, type Company } from "./types";

/** Company profile summary with in-place edit. */
export function ProfileCard({
  companyId,
  company,
  portfolioCompany,
  onSaved,
  setMessage,
}: {
  companyId: string;
  company: Company;
  portfolioCompany: { id: string; name: string } | null;
  onSaved: (company: Company) => void;
  setMessage: (m: FlashMessage | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Company | null>(company);
  const [saving, setSaving] = useState(false);

  function updateEditField(field: keyof Company, value: string | number | null) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSaveEdit() {
    if (!editForm) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          website: normalizeUrl(editForm.website ?? ""),
          sector: editForm.sector,
          geography: editForm.geography,
          fundingStage: editForm.fundingStage,
          aliases: editForm.aliases,
          reminderFrequencyDays: editForm.reminderFrequencyDays,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to save");
      }
      onSaved(editForm);
      setEditing(false);
      setMessage({ type: "success", text: "Company profile updated." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
  <Card className="mb-6">
    <CardHeader>
      <div className="flex items-start justify-between">
        <CardTitle className="flex items-center gap-3">
          {company.logo ? (
            <img
              src={company.logo}
              alt={company.name}
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
              <Building2 className="h-5 w-5" />
            </div>
          )}
          {editing ? "Edit Company" : company.name}
        </CardTitle>
        {!editing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditForm(company);
              setEditing(true);
              setMessage(null);
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      {editing && editForm ? (
        <div className="space-y-4">
          <Input
            id="edit-name"
            label="Company Name"
            value={editForm.name}
            onChange={(e) => updateEditField("name", e.target.value)}
            required
          />
          <Textarea
            id="edit-description"
            label="Description"
            value={editForm.description ?? ""}
            onChange={(e) => updateEditField("description", e.target.value)}
            rows={3}
          />
          <Input
            id="edit-website"
            label="Website"
            type="text"
            value={editForm.website ?? ""}
            onChange={(e) => updateEditField("website", e.target.value)}
            placeholder="example.com"
          />
          <SectorCombobox
            id="edit-sector"
            label="Sector"
            value={editForm.sector ?? ""}
            onChange={(v) => updateEditField("sector", v || null)}
            isAdmin
          />
          <Input
            id="edit-geography"
            label="Geography"
            value={editForm.geography ?? ""}
            onChange={(e) => updateEditField("geography", e.target.value)}
          />
          <div className="space-y-1">
            <label htmlFor="edit-aliases" className="label">
              Aliases
            </label>
            <input
              id="edit-aliases"
              className="input-field"
              placeholder="e.g. Acme, AcmeHQ"
              value={editForm.aliases.join(", ")}
              onChange={(e) =>
                setEditForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        aliases: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }
                    : prev
                )
              }
            />
            <p className="text-xs text-muted-foreground">Comma-separated alternative names used for Granola matching</p>
          </div>
          <Select id="edit-fundingStage" label="Funding Stage" value={editForm.fundingStage ?? ""} onChange={(e) => updateEditField("fundingStage", e.target.value)}>
            <option value="">Select a stage</option>
            {FUNDING_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <div className="space-y-1">
            <Select
              id="edit-reminderFrequency"
              label="Update Reminder Frequency"
              value={editForm.reminderFrequencyDays ?? ""}
              onChange={(e) =>
                updateEditField(
                  "reminderFrequencyDays",
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
            >
              {REMINDER_OPTIONS.map((o) => (
                <option key={String(o.value)} value={o.value ?? ""}>
                  {o.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Founders will receive an email reminder when they haven&apos;t submitted an update within this window.
            </p>
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditing(false);
                setEditForm(company);
                setMessage(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={handleSaveEdit}>
              <Save className="mr-2 h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {company.description && (
            <p className="text-sm text-muted-foreground">{company.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            {company.sector && (
              <div className="flex items-center gap-1.5">
                <Badge variant="neutral">{company.sector}</Badge>
              </div>
            )}
            {company.geography && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {company.geography}
              </div>
            )}
            {company.fundingStage && (
              <div className="flex items-center gap-1.5">
                <Badge variant="info">{company.fundingStage}</Badge>
              </div>
            )}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-primary hover:underline"
              >
                <Globe className="h-3.5 w-3.5" />
                Website
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Bell className="h-3.5 w-3.5" />
            {company.reminderFrequencyDays ? (
              <>
                Reminders:{" "}
                <span className="font-medium text-foreground">
                  {REMINDER_OPTIONS.find((o) => o.value === company.reminderFrequencyDays)?.label ?? `Every ${company.reminderFrequencyDays}d`}
                </span>
                {company.lastReminderSentAt ? (
                  <span className="ml-1">
                    &middot; Last sent{" "}
                    {Math.floor(
                      (Date.now() - new Date(company.lastReminderSentAt).getTime()) /
                        86_400_000
                    )}
                    d ago
                  </span>
                ) : (
                  <span className="ml-1">&middot; Never sent</span>
                )}
              </>
            ) : (
              <span>Reminders: Off</span>
            )}
          </div>
          {portfolioCompany && (
            <div className="flex items-center gap-1.5 text-sm">
              <Link
                href={`/admin/portfolio/${portfolioCompany.id}`}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                Portfolio: {portfolioCompany.name} →
              </Link>
            </div>
          )}
        </div>
      )}
    </CardContent>
  </Card>
  );
}
