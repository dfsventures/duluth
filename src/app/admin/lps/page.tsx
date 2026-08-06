"use client";

import { useEffect, useState, useCallback } from "react";
import { Handshake, Plus, X, Pencil, Trash2, Star } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, Th, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

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

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this LP? This removes their fund memberships and signs them out everywhere. This cannot be undone.")) return;
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
      const ok = window.confirm(
        "This is their only address — removing it signs them out and they won't be able to log in until you add another. Continue?"
      );
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

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : lps.length === 0 ? (
        <EmptyState icon={<Handshake className="h-8 w-8" />} title="No LPs yet" description="Add an LP to grant them access to fund reports." />
      ) : (
        <Table tableClassName="min-w-[640px]">
          <TableHead>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Funds</Th>
            <Th>Added</Th>
            <Th></Th>
          </TableHead>
          <tbody>
            {lps.map((lp) => {
              const primary = lp.emails.find((e) => e.isPrimary) ?? lp.emails[0];
              return (
                <TableRow key={lp.id}>
                  <td className="px-4 py-2.5 font-medium">{lp.name ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {!primary ? (
                      <span className="text-muted-foreground">No address</span>
                    ) : (
                      <>
                        {primary.email}
                        {lp.emails.length > 1 && <span className="ml-1 text-muted-foreground">+{lp.emails.length - 1}</span>}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {lp.funds.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        lp.funds.map((f) => (
                          <span key={f.id} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                            {f.slug}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{formatDate(lp.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(lp)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(lp.id)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-laterite" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}

      {editTarget && (
        <Modal title={editTarget === "new" ? "New LP" : `Edit — ${(editTarget as Lp).name ?? (editTarget as Lp).email ?? "LP"}`} onClose={() => setEditTarget(null)}>
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
                        {e.isPrimary && <Star className="h-3.5 w-3.5 fill-current text-ochre" />}
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
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-laterite disabled:opacity-50"
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
                {addressError && <p className="mt-1 text-xs text-laterite">{addressError}</p>}
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

            {saveError && <p className="text-sm text-laterite">{saveError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editTarget === "new" ? "Add LP" : "Save Changes"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
