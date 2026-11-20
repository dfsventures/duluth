"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MEMO_LIMITS } from "@/lib/memos";
import { readError, targetValue, type LinkTargets } from "@/components/admin/memos/types";
import { cn } from "@/lib/utils";
import { useNewLook } from "@/lib/use-new-look";
import { EDITOR_COLUMN, EDITOR_SECTION_CARD } from "@/lib/editor-styles";

const NOT_IN_MOLLY = "__pending__";

export default function NewMemoForm({ targets }: { targets: LinkTargets }) {
  const router = useRouter();
  const newLook = useNewLook();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [pending, setPending] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = { title };
      if (company === NOT_IN_MOLLY) body.companyNamePending = pending;
      else if (company.startsWith("p:")) body.portfolioCompanyId = company.slice(2);
      else if (company) body.companyId = company.slice(2);
      const res = await fetch("/api/admin/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't create the memo."));
      const { id } = await res.json();
      router.push(`/admin/memos/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the memo.");
      setSaving(false);
    }
  }

  return (
    <AppShell width="narrow">
      {/* New look (audit #8): the Form header replaces the breadcrumb row. */}
      {!newLook && <Breadcrumb items={[{ label: "Memos", href: "/admin/memos" }, { label: "New memo" }]} />}
      {/* New look (page types v1, §4.3 form variant): the editor bar holds the way back and the actions. */}
      <ComposerTopBar
        newLookOnly
        back={{ href: "/admin/memos", label: "Memos" }}
        draftLabel="Not saved yet"
        showPublish={false}
        secondaryActions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/admin/memos")}>
              Cancel
            </Button>
            <Button type="submit" size="sm" form="new-memo-form" loading={saving} disabled={!title.trim()}>
              Create memo
            </Button>
          </>
        }
      />
      <PageHeader
        type="form"
        title="New memo"
        description="Starts as a private draft with the house sections. Nobody else can see it until you share it."
      />
      <Card className={cn("max-w-xl", EDITOR_COLUMN, EDITOR_SECTION_CARD)}>
        <form id="new-memo-form" onSubmit={submit} className="space-y-4">
          <Input
            id="memo-title"
            label="Title"
            value={title}
            maxLength={MEMO_LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Acme: seed round"
            required
            autoFocus
          />
          <Select id="memo-company" label="Company" value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">No company yet</option>
            <optgroup label="Companies in Molly">
              {targets.companies.map((c) => (
                <option key={targetValue(c)} value={targetValue(c)}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Deal Ledger">
              {targets.ledger.map((c) => (
                <option key={targetValue(c)} value={targetValue(c)}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <option value={NOT_IN_MOLLY}>Not in Molly (type the name)</option>
          </Select>
          {company === NOT_IN_MOLLY && (
            <Input
              id="memo-pending"
              label="Company name"
              value={pending}
              maxLength={MEMO_LIMITS.title}
              onChange={(e) => setPending(e.target.value)}
              placeholder="Acme"
              required
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 v2:hidden">
            <Button type="button" variant="secondary" onClick={() => router.push("/admin/memos")}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!title.trim()}>
              Create memo
            </Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
