"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Save, AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const SECTORS = [
  "Fintech",
  "Agritech",
  "Healthtech",
  "Logistics",
  "Education",
  "E-commerce",
  "Other",
];

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
  const { data: session } = useSession();
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
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadCompany() {
      try {
        const res = await fetch("/api/companies");
        if (!res.ok) throw new Error("Failed to load companies");
        const data = await res.json();
        const companies = data.data ?? data;

        if (!companies || companies.length === 0) {
          setLoading(false);
          return;
        }

        const company = companies[0];
        setCompanyId(company.id);

        const detailRes = await fetch(`/api/companies/${company.id}`);
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
  }, []);

  function updateField(field: keyof CompanyFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!companyId) {
      setMessage({ type: "error", text: "No company found. Please complete the setup wizard first." });
      return;
    }

    if (!form.name.trim()) {
      setMessage({ type: "error", text: "Company name is required." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to save");
      }

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
        description="Manage your company information visible to the DFS Lab team."
      />

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {message.text}
        </div>
      )}

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
              type="url"
              value={form.website}
              onChange={(e) => updateField("website", e.target.value)}
              placeholder="https://yourcompany.com"
            />

            <div className="space-y-1">
              <label htmlFor="sector" className="label">
                Sector
              </label>
              <select
                id="sector"
                value={form.sector}
                onChange={(e) => updateField("sector", e.target.value)}
                className="input-field"
              >
                <option value="">Select a sector</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <Input
              id="geography"
              label="Geography"
              value={form.geography}
              onChange={(e) => updateField("geography", e.target.value)}
              placeholder="e.g. Kenya, West Africa, Pan-African"
            />

            <div className="space-y-1">
              <label htmlFor="fundingStage" className="label">
                Funding Stage
              </label>
              <select
                id="fundingStage"
                value={form.fundingStage}
                onChange={(e) => updateField("fundingStage", e.target.value)}
                className="input-field"
              >
                <option value="">Select a stage</option>
                {FUNDING_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
