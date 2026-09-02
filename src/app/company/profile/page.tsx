"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  AlertCircle,
  CheckCircle2,
  Upload,
  Pencil,
  Globe,
  MapPin,
  ExternalLink,
  Building2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { normalizeUrl } from "@/lib/utils";
import { SectorCombobox } from "@/components/ui/sector-combobox";
import { useCompany } from "@/context/company-context";
import { ORG_NAME } from "@/lib/org";

const FUNDING_STAGES = ["Pre-seed", "Seed", "Series A", "Series B+"];

interface CompanyFormData {
  name: string;
  description: string;
  website: string;
  sector: string;
  geography: string;
  fundingStage: string;
}

export default function CompanyProfilePage() {
  const router = useRouter();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyFormData>({
    name: "",
    description: "",
    website: "",
    sector: "",
    geography: "",
    fundingStage: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<CompanyFormData | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (companyLoading) return;

    async function loadCompany() {
      try {
        if (!selectedCompany) {
          setLoading(false);
          return;
        }

        setCompanyId(selectedCompany.id);

        const detailRes = await fetch(`/api/companies/${selectedCompany.id}`);
        if (!detailRes.ok) throw new Error("Failed to load company details");
        const detail = await detailRes.json();
        const c = detail.data ?? detail;

        setForm({
          name: c.name ?? "",
          description: c.description ?? "",
          website: c.website ?? "",
          sector: c.sector ?? "",
          geography: c.geography ?? "",
          fundingStage: c.fundingStage ?? "",
        });
      } catch {
        setMessage({ type: "error", text: "Failed to load company data." });
      } finally {
        setLoading(false);
      }
    }

    loadCompany();
  }, [companyLoading, selectedCompany?.id]);

  function updateField(field: keyof CompanyFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  }

  function startEditing() {
    setEditSnapshot({ ...form });
    setEditing(true);
    setMessage(null);
  }

  function cancelEditing() {
    if (editSnapshot) setForm(editSnapshot);
    setEditing(false);
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!companyId) {
      setMessage({
        type: "error",
        text: "No company found. Please complete the setup wizard first.",
      });
      return;
    }

    if (!form.name.trim()) {
      setMessage({ type: "error", text: "Company name is required." });
      return;
    }

    setSaving(true);
    setMessage(null);

    const website = normalizeUrl(form.website);

    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to save");
      }

      setForm((prev) => ({ ...prev, website }));
      setEditing(false);
      setMessage({ type: "success", text: "Company profile saved successfully." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Company Profile"
        description={`Manage your company information visible to the ${ORG_NAME} team.`}
      />

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-acacia/30 bg-acacia/10 text-acacia"
              : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}>
            <X className="h-4 w-4 opacity-50 hover:opacity-100" />
          </button>
        </div>
      )}

      {!editing ? (
        /* ── View mode ── */
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                  <Building2 className="h-5 w-5" />
                </div>
                {form.name || "Your Company"}
              </CardTitle>
              <Button variant="secondary" size="sm" onClick={startEditing}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!companyId ? (
              <p className="text-sm text-muted-foreground">
                Your company profile hasn&apos;t been set up yet.{" "}
                <button
                  onClick={() => router.push("/setup-wizard")}
                  className="font-medium text-primary hover:underline"
                >
                  Complete setup
                </button>
              </p>
            ) : (
              <div className="space-y-3">
                {form.description && (
                  <p className="text-sm text-muted-foreground">
                    {form.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-4 text-sm">
                  {form.sector && (
                    <Badge variant="neutral">{form.sector}</Badge>
                  )}
                  {form.geography && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {form.geography}
                    </div>
                  )}
                  {form.fundingStage && (
                    <Badge variant="info">{form.fundingStage}</Badge>
                  )}
                  {form.website && (
                    <a
                      href={form.website}
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
                {!form.description &&
                  !form.sector &&
                  !form.geography &&
                  !form.fundingStage &&
                  !form.website && (
                    <p className="text-sm text-muted-foreground">
                      No details filled in yet. Click Edit to complete your
                      profile.
                    </p>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* ── Edit mode ── */
        <form onSubmit={handleSave} className="space-y-6">
          {/* Logo upload */}
          <Card>
            <CardHeader>
              <CardTitle>Company Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary-500"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    PNG, JPG, or SVG. Max 2MB.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company details */}
          <Card>
            <CardHeader>
              <CardTitle>Company Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                id="name"
                label="Company Name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Your company name"
                required
              />

              <Textarea
                id="description"
                label="Description"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Briefly describe what your company does..."
                rows={4}
              />

              <Input
                id="website"
                label="Website"
                type="text"
                value={form.website}
                onChange={(e) => updateField("website", e.target.value)}
                placeholder="yourcompany.com"
              />

              <SectorCombobox
                id="sector"
                label="Sector"
                value={form.sector}
                onChange={(v) => updateField("sector", v)}
              />

              <Input
                id="geography"
                label="Geography"
                value={form.geography}
                onChange={(e) => updateField("geography", e.target.value)}
                placeholder="e.g. Kenya, West Africa, Pan-African"
              />

              <Select id="fundingStage" label="Funding Stage" value={form.fundingStage} onChange={(e) => updateField("fundingStage", e.target.value)}>
                <option value="">Select a stage</option>
                {FUNDING_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={cancelEditing}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
