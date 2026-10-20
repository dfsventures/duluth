"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MEMO_LIMITS } from "@/lib/memos";
import { readError, type CompanyOption } from "@/components/admin/memos/types";

const NOT_IN_MOLLY = "__pending__";

export default function NewMemoForm({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();
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
      else if (company) body.companyId = company;
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
    <AppShell>
      <Breadcrumb items={[{ label: "Memos", href: "/admin/memos" }, { label: "New memo" }]} />
      <PageHeader title="New memo" description="Starts as a private draft with the house sections. Nobody else can see it until you share it." />
      <Card className="max-w-xl">
        <form onSubmit={submit} className="space-y-4">
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
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NOT_IN_MOLLY}>Company isn&apos;t in Molly yet</option>
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
          <div className="flex justify-end gap-2">
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
