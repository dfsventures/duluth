"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { readError, targetValue, type LinkTargets } from "./types";

const linkBody = (value: string, expectedVersion: number) =>
  value.startsWith("p:") ? { expectedVersion, portfolioCompanyId: value.slice(2) } : { expectedVersion, companyId: value.slice(2) };

/**
 * Owner only. Links the memo to a Company or a deal-ledger row and clears the pending name. With
 * `currentValue` set (the memo is linked) it reads "Change company": Save unlinks, then links the new
 * choice; "Unlink" goes back to "<name> · Not linked".
 */
export function LinkCompanyDialog({
  memoId,
  version,
  targets,
  initialValue,
  currentValue,
  onClose,
  onLinked,
}: {
  memoId: string;
  version: number;
  targets: LinkTargets;
  /** "c:<id>" or "p:<id>" to preselect (the banner's suggestion). */
  initialValue?: string;
  /** Set when the memo is already linked: the current "c:<id>" / "p:<id>". */
  currentValue?: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const changing = !!currentValue;
  const [value, setValue] = useState(initialValue ?? currentValue ?? "");
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState("");

  async function send(method: "POST" | "DELETE", body: Record<string, unknown>, fallback: string) {
    const res = await fetch(`/api/admin/memos/${memoId}/link-company`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res, fallback));
  }

  async function link() {
    setSaving(true);
    setError("");
    try {
      let v = version;
      if (changing) {
        await send("DELETE", { expectedVersion: v }, "Couldn't change the company.");
        v += 1;
      }
      await send("POST", linkBody(value, v), "Couldn't link the company.");
      toast.success(changing ? "Company changed." : "Linked to the company.");
      onLinked();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't link the company.");
      if (changing) onLinked(); // the unlink may have gone through; show the memo as it is now
    } finally {
      setSaving(false);
    }
  }

  async function unlink() {
    setUnlinking(true);
    setError("");
    try {
      await send("DELETE", { expectedVersion: version }, "Couldn't unlink the company.");
      toast.success("Unlinked.");
      onLinked();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't unlink the company.");
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <ModalDialog title={changing ? "Change company" : "Link to company"} onClose={onClose} size="sm">
      <div className="space-y-4">
        <Select id="link-company" label="Company" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose a company</option>
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
        </Select>
        <p className="text-xs text-muted-foreground">Deal-ledger companies link to their ledger page until they&apos;re added to Molly.</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {changing && (
            <Button variant="secondary" onClick={unlink} loading={unlinking} disabled={saving} className="mr-auto">
              Unlink
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={link} loading={saving} disabled={!value || value === currentValue || unlinking}>
            {changing ? "Change company" : "Link company"}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
