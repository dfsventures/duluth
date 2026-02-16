"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Building2,
  Save,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  UserPlus,
} from "lucide-react";
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

export default function NewCompanyPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Company form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [sector, setSector] = useState("");
  const [geography, setGeography] = useState("");
  const [fundingStage, setFundingStage] = useState("");

  // Optional user assignment
  const [assignUser, setAssignUser] = useState<"none" | "existing" | "new">("none");
  const [existingUserEmail, setExistingUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setMessage({ type: "error", text: "Company name is required." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        website: website.trim(),
        sector,
        geography: geography.trim(),
        fundingStage,
      };

      if (assignUser === "existing" && existingUserEmail.trim()) {
        payload.existingUserEmail = existingUserEmail.trim();
      } else if (assignUser === "new" && newUserEmail.trim()) {
        payload.newUser = {
          name: newUserName.trim(),
          email: newUserEmail.trim(),
        };
      }

      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to create company");
      }

      const result = await res.json();
      const newCompany = result.data ?? result;

      if (newCompany?.id) {
        router.push(`/admin/companies/${newCompany.id}`);
      } else {
        setMessage({
          type: "success",
          text: "Company created successfully.",
        });
        router.push("/admin/companies");
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create company.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Add Company"
        description="Manually create a new portfolio company."
        action={
          <Button variant="ghost" onClick={() => router.push("/admin/companies")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        }
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              id="name"
              label="Company Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter company name"
              required
            />

            <Textarea
              id="description"
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what the company does..."
              rows={4}
            />

            <Input
              id="website"
              label="Website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
            />

            <div className="space-y-1">
              <label htmlFor="sector" className="label">
                Sector
              </label>
              <select
                id="sector"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
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
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
              placeholder="e.g. Kenya, West Africa, Pan-African"
            />

            <div className="space-y-1">
              <label htmlFor="fundingStage" className="label">
                Funding Stage
              </label>
              <select
                id="fundingStage"
                value={fundingStage}
                onChange={(e) => setFundingStage(e.target.value)}
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

        {/* User assignment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Assign User (Optional)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="label">User Assignment</label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={assignUser === "none" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setAssignUser("none")}
                >
                  None
                </Button>
                <Button
                  type="button"
                  variant={assignUser === "existing" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setAssignUser("existing")}
                >
                  Existing User
                </Button>
                <Button
                  type="button"
                  variant={assignUser === "new" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setAssignUser("new")}
                >
                  Create New User
                </Button>
              </div>
            </div>

            {assignUser === "existing" && (
              <Input
                id="existingUserEmail"
                label="User Email"
                type="email"
                value={existingUserEmail}
                onChange={(e) => setExistingUserEmail(e.target.value)}
                placeholder="user@example.com"
              />
            )}

            {assignUser === "new" && (
              <>
                <Input
                  id="newUserName"
                  label="Full Name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="John Doe"
                />
                <Input
                  id="newUserEmail"
                  label="Email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/admin/companies")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Creating..." : "Create Company"}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
