"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Building2, Save, ArrowLeft, UserPlus } from "lucide-react";
import { cn, normalizeUrl } from "@/lib/utils";
import { SectorCombobox } from "@/components/ui/sector-combobox";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useFlashMessage } from "@/lib/use-flash-message";
import { EDITOR_COLUMN, EDITOR_SECTION_BODY, EDITOR_SECTION_CARD, segmentClass } from "@/lib/editor-styles";

const FUNDING_STAGES = ["Pre-seed", "Seed", "Series A", "Series B+"];

export default function NewCompanyPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [, setMessage] = useFlashMessage();

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

  // Due-diligence intake (Part 16, Q56/Q58)
  const [isDueDiligence, setIsDueDiligence] = useState(false);
  const [isStellarEcosystem, setIsStellarEcosystem] = useState(false);

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
        website: normalizeUrl(website),
        sector,
        geography: geography.trim(),
        fundingStage,
      };

      if (assignUser === "existing" && existingUserEmail.trim()) {
        payload.userEmail = existingUserEmail.trim();
      } else if (assignUser === "new" && newUserEmail.trim()) {
        payload.userEmail = newUserEmail.trim();
        payload.userName = newUserName.trim();
      }

      if (assignUser !== "none" && isDueDiligence) {
        payload.dueDiligence = { isStellarEcosystem };
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
      const wasDueDiligence = assignUser !== "none" && isDueDiligence;

      if (newCompany?.id) {
        // A DD-stage company won't appear on /admin/companies (WS38's
        // filter) until an admin promotes it via /admin/diligence (WS41).
        router.push(wasDueDiligence ? "/admin/diligence" : `/admin/companies/${newCompany.id}`);
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
    <AppShell width="narrow">
      {/* Page types v1, §4.3 form variant: the editor bar holds the way back and the actions;
          the heading opens the content. */}
      <ComposerTopBar
        back={{ href: "/admin/companies", label: "Companies" }}
        draftLabel="Not saved yet"
        showPublish={false}
        secondaryActions={
          <>
            {/* Phones: the back chevron does the same, so Cancel is not drawn (§6). */}
            <Button type="button" variant="ghost" size="sm" className="max-md:v2:hidden" onClick={() => router.push("/admin/companies")}>
              Cancel
            </Button>
            <Button type="submit" size="sm" form="add-company-form" disabled={saving}>
              {saving ? "Creating..." : "Create company"}
            </Button>
          </>
        }
      />
      <PageHeader
        type="form"
        title="Add company"
        description="Manually create a new portfolio company."
        action={
          <Button variant="ghost" onClick={() => router.push("/admin/companies")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        }
      />


      <form id="add-company-form" onSubmit={handleSubmit} className={cn("space-y-6 v2:space-y-8", EDITOR_COLUMN)}>
        {/* Company details */}
        <Card className={EDITOR_SECTION_CARD}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 v2:font-sans">
              <Building2 className="h-5 w-5 v2:hidden" />
              Company Details
            </CardTitle>
          </CardHeader>
          <CardContent className={cn("space-y-4", EDITOR_SECTION_BODY)}>
            <Input
              id="name"
              label="Company name"
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
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="example.com"
            />

            <SectorCombobox
              id="sector"
              label="Sector"
              value={sector}
              onChange={setSector}
              isAdmin
            />

            <Input
              id="geography"
              label="Geography"
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
              placeholder="e.g. Kenya, West Africa, Pan-African"
            />

            <Select id="fundingStage" label="Funding stage" value={fundingStage} onChange={(e) => setFundingStage(e.target.value)}>
              <option value="">Select a stage</option>
              {FUNDING_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </CardContent>
        </Card>

        {/* User assignment */}
        <Card className={EDITOR_SECTION_CARD}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 v2:font-sans">
              <UserPlus className="h-5 w-5 v2:hidden" />
              Assign a user (optional)
            </CardTitle>
          </CardHeader>
          <CardContent className={cn("space-y-4", EDITOR_SECTION_BODY)}>
            <div className="space-y-1">
              {/* The chosen option is marked, not made a second primary button. */}
              <div role="group" aria-label="Assign a user" className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-pressed={assignUser === "none"}
                  className={segmentClass(assignUser === "none")}
                  onClick={() => setAssignUser("none")}
                >
                  None
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-pressed={assignUser === "existing"}
                  className={segmentClass(assignUser === "existing")}
                  onClick={() => setAssignUser("existing")}
                >
                  Existing user
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-pressed={assignUser === "new"}
                  className={segmentClass(assignUser === "new")}
                  onClick={() => setAssignUser("new")}
                >
                  New user
                </Button>
              </div>
            </div>

            {assignUser === "existing" && (
              <Input
                id="existingUserEmail"
                label="User email"
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

            {assignUser !== "none" && (
              <div className="space-y-3 border-t border-border pt-4">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDueDiligence}
                    onChange={(e) => setIsDueDiligence(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  This is a due-diligence intake
                </label>

                {isDueDiligence && (
                  <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isStellarEcosystem}
                      onChange={(e) => setIsStellarEcosystem(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    This deal involves the Stellar ecosystem
                  </label>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3 v2:hidden">
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
