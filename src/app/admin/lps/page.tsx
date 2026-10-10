"use client";

import { useEffect, useState, useCallback } from "react";
import { Handshake, Plus, X, Pencil, Trash2, Star } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ModalSheet } from "@/components/ui/sheet";

interface FundOption {
  id: string;
  name: string;
  slug: string;
}

interface LpEmail {
  email: string;
  isPrimary: boolean;
}

interface Lp {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  funds: FundOption[];
  emails: LpEmail[];
}

function primaryEmail(lp: Lp): LpEmail | undefined {
  return lp.emails.find((e) => e.isPrimary) ?? lp.emails[0];
}

const lpColumns: DataTableColumn<Lp>[] = [
  {
    key: "name",
    header: "Name",
    sortValue: (lp) => lp.name,
    cell: (lp) => lp.name ?? "—",
  },
  {
    key: "email",
    header: "Email",
    sortValue: (lp) => primaryEmail(lp)?.email,
    mobile: "meta",
    cell: (lp) => {
      const primary = primaryEmail(lp);
      return !primary ? (
        <span className="text-muted-foreground">No address</span>
      ) : (
        <span className="font-mono text-xs">
          {primary.email}
          {lp.emails.length > 1 && <span className="ml-1 text-muted-foreground">+{lp.emails.length - 1}</span>}
        </span>
      );
    },
  },
  {
    key: "funds",
    header: "Funds",
    sortValue: (lp) => lp.funds.length,
    firstDir: "desc",
    mobile: "meta",
    cell: (lp) =>
      lp.funds.length === 0 ? (
        <span className="text-xs text-muted-foreground">None</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {lp.funds.map((f) => (
            <span key={f.id} className="badge-neutral !px-1.5 !py-0.5 !text-xs">
              {f.slug}
            </span>
          ))}
        </span>
      ),
  },
  {
    key: "added",
    header: "Added",
    sortValue: (lp) => new Date(lp.createdAt).getTime(),
    firstDir: "desc",
    className: "whitespace-nowrap text-xs text-muted-foreground",
    cell: (lp) => formatDate(lp.createdAt),
  },
];

export default function AdminLpsPage() {
  const [lps, setLps] = useState<Lp[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [editTarget, setEditTarget] = useState<Lp | "new" | null>(null);
  const [form, setForm] = useState<{ email: string; name: string; fundIds: string[] }>({ email: "", name: "", fundIds: [] });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // WS60: address-list management state for the edit modal.
  const [newAddress, setNewAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [addressBusy, setAddressBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [lpsRes, fundsRes] = await Promise.all([fetch("/api/admin/lps"), fetch("/api/admin/funds")]);
      if (lpsRes.ok) setLps(await lpsRes.json());
      if (fundsRes.ok) setFunds(await fundsRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refetch the LP list and re-point editTarget at the refreshed row, so the
  // address list in an open edit modal reflects a just-completed mutation
  // without closing the modal.
  async function refreshLps(id?: string) {
    const res = await fetch("/api/admin/lps");
    if (!res.ok) return;
    const data: Lp[] = await res.json();
    setLps(data);
    if (id) {
      const updated = data.find((l) => l.id === id);
      if (updated) setEditTarget(updated);
    }
  }

  function openNew() {
    setEditTarget("new");
    setForm({ email: "", name: "", fundIds: [] });
    setSaveError("");
    setNewAddress("");
    setAddressError("");
  }

  function openEdit(lp: Lp) {
    setEditTarget(lp);
    setForm({ email: "", name: lp.name ?? "", fundIds: lp.funds.map((f) => f.id) });
    setSaveError("");
    setNewAddress("");
    setAddressError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const isNew = editTarget === "new";
      if (isNew) {
        const res = await fetch("/api/admin/lps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, name: form.name || null, fundIds: form.fundIds }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? "Failed to create LP");
        }
      } else {
        const lp = editTarget as Lp;
        // WS60: email is managed via the address list below — this PATCH is
        // name-only now.
        const res = await fetch(`/api/admin/lps/${lp.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name || null }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? "Failed to save LP");
        }
        // fund membership changes go through the fund-scoped endpoint —
        // reconcile any diff introduced in this modal
        const toAdd = form.fundIds.filter((id) => !lp.funds.some((f) => f.id === id));
        const toRemove = lp.funds.filter((f) => !form.fundIds.includes(f.id)).map((f) => f.id);
        for (const fundId of toAdd) {
          await fetch(`/api/admin/lps/${lp.id}/funds`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fundId }),
          });
        }
        for (const fundId of toRemove) {
          await fetch(`/api/admin/lps/${lp.id}/funds`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fundId }),
          });
        }
      }
      setEditTarget(null);
      loadData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const confirm = useConfirm();
  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete this LP", description: "This removes their fund memberships and signs them out everywhere. This cannot be undone.", confirmLabel: "Delete LP", typeToConfirm: lps.find((l) => l.id === id)?.name || lps.find((l) => l.id === id)?.email || "delete" }))) return;
    await fetch(`/api/admin/lps/${id}`, { method: "DELETE" });
    loadData();
  }

  function toggleFund(fundId: string) {
    setForm((f) => ({
      ...f,
      fundIds: f.fundIds.includes(fundId) ? f.fundIds.filter((id) => id !== fundId) : [...f.fundIds, fundId],
    }));
  }

  async function handleAddAddress(lp: Lp) {
    const email = newAddress.trim();
    if (!email) return;
    setAddressBusy(true);
    setAddressError("");
    try {
      const res = await fetch(`/api/admin/lps/${lp.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setAddressError(d?.error ?? "Failed to add address");
        return;
      }
      setNewAddress("");
      await refreshLps(lp.id);
    } finally {
      setAddressBusy(false);
    }
  }

  async function handleRemoveAddress(lp: Lp, email: string) {
    const isLast = lp.emails.length === 1;
    if (isLast) {
      const ok = await confirm({
        title: "Remove their only address",
        description: "Removing it signs them out, and they won't be able to log in until you add another.",
        confirmLabel: "Remove address",
      });
      if (!ok) return;
    }
    setAddressBusy(true);
    setAddressError("");
    try {
      const res = await fetch(`/api/admin/lps/${lp.id}/emails`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setAddressError(d?.error ?? "Failed to remove address");
        return;
      }
      await refreshLps(lp.id);
    } finally {
      setAddressBusy(false);
    }
  }

  async function handleMakePrimary(lp: Lp, email: string) {
    setAddressBusy(true);
    setAddressError("");
    try {
      const res = await fetch(`/api/admin/lps/${lp.id}/emails`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setAddressError(d?.error ?? "Failed to set primary address");
        return;
      }
      await refreshLps(lp.id);
    } finally {
      setAddressBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="LPs"
        description="Limited partners who can view fund reports on the LP portal."
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            New LP
          </Button>
        }
      />

      <DataTable<Lp>
        label="LPs"
        noun="LP"
        rows={lps}
        rowKey={(lp) => lp.id}
        columns={lpColumns}
        defaultSort={{ key: "name", dir: "asc" }}
        // Part 32, WS86 (D2): an LP has many LpEmail rows (Part 26), so search
        // matches any of them, not just the primary one shown in the table.
        searchText={(lp) => [lp.name, ...lp.emails.map((e) => e.email)]}
        searchPlaceholder="Filter by LP name or email"
        loading={loading}
        minWidth={640}
        actionsLabel="Row actions"
        rowActions={(lp) => (
          <>
            <Button variant="ghost" size="icon" aria-label={`Edit ${lp.name ?? "LP"}`} title="Edit" onClick={() => openEdit(lp)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${lp.name ?? "LP"}`}
              title="Delete"
              className="hover:text-tone-clay-ink"
              onClick={() => handleDelete(lp.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
        empty={
          <EmptyState eyebrow="LPs"
            icon={<Handshake className="h-8 w-8" />}
            title="No LPs yet"
            description="Add an LP to grant them access to fund reports."
            action={
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" />
                New LP
              </Button>
            }
          />
        }
      />

      {editTarget && (
        <ModalSheet className="sm:max-w-[520px]" title={editTarget === "new" ? "New LP" : `Edit — ${(editTarget as Lp).name ?? (editTarget as Lp).email ?? "LP"}`} onClose={() => setEditTarget(null)}>
          <form onSubmit={handleSave} className="space-y-4">
            {editTarget === "new" ? (
              <Input
                label="Email *"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            ) : (
              <div>
                <label className="label mb-1.5 block">Addresses</label>
                <div className="space-y-1.5">
                  {(editTarget as Lp).emails.length === 0 && (
                    <p className="text-xs text-muted-foreground">No address — this LP cannot log in until one is added.</p>
                  )}
                  {(editTarget as Lp).emails.map((e) => (
                    <div key={e.email} className="flex items-center justify-between gap-2 rounded-sm border border-border px-2.5 py-1.5">
                      <span className="flex items-center gap-1.5 font-mono text-xs">
                        {e.isPrimary && <Star className="h-3.5 w-3.5 fill-current text-tone-amber-ink" />}
                        {e.email}
                      </span>
                      <div className="flex items-center gap-2">
                        {!e.isPrimary && (
                          <button
                            type="button"
                            disabled={addressBusy}
                            onClick={() => handleMakePrimary(editTarget as Lp, e.email)}
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            Make primary
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={addressBusy}
                          onClick={() => handleRemoveAddress(editTarget as Lp, e.email)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-tone-clay-ink disabled:opacity-50"
                          title="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="email"
                    placeholder="Add an address"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="input-field flex-1"
                  />
                  <Button type="button" variant="secondary" size="sm" disabled={addressBusy || !newAddress.trim()} onClick={() => handleAddAddress(editTarget as Lp)}>
                    Add
                  </Button>
                </div>
                {addressError && <p className="mt-1 text-xs text-tone-clay-ink">{addressError}</p>}
              </div>
            )}
            <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />

            <div>
              <label className="label mb-1.5 block">Funds</label>
              <div className="flex flex-wrap gap-2">
                {funds.map((fund) => (
                  <button
                    type="button"
                    key={fund.id}
                    onClick={() => toggleFund(fund.id)}
                    className={`rounded-sm border px-2.5 py-1 text-xs font-mono transition-colors ${
                      form.fundIds.includes(fund.id) ? "border-primary bg-primary-50 text-primary-700" : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {fund.slug}
                  </button>
                ))}
              </div>
            </div>

            {saveError && <p className="text-sm text-tone-clay-ink">{saveError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editTarget === "new" ? "Add LP" : "Save Changes"}
              </Button>
            </div>
          </form>
        </ModalSheet>
      )}
    </AppShell>
  );
}
