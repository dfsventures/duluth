"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { readError, type CompanyOption } from "./types";

/** Owner only: links the memo to a Company (either stage) and clears the "not in Molly yet" name. */
export function LinkCompanyDialog({
  memoId,
  version,
  companies,
  initialCompanyId,
  onClose,
  onLinked,
}: {
  memoId: string;
  version: number;
  companies: CompanyOption[];
  initialCompanyId?: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function link() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/memos/${memoId}/link-company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version, companyId }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't link the company."));
      toast.success("Linked to the company.");
      onLinked();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't link the company.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalDialog title="Link to company" onClose={onClose} size="sm">
      <div className="space-y-4">
        <Select id="link-company" label="Company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Choose a company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={link} loading={saving} disabled={!companyId}>
            Link company
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
