"use client";

import { useEffect, useState, useCallback } from "react";
import { Handshake, Plus, X, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

interface FundOption {
  id: string;
  name: string;
  slug: string;
}

interface Lp {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  funds: FundOption[];
}

export default function AdminLpsPage() {
  const [lps, setLps] = useState<Lp[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [editTarget, setEditTarget] = useState<Lp | "new" | null>(null);
  const [form, setForm] = useState<{ email: string; name: string; fundIds: string[] }>({ email: "", name: "", fundIds: [] });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [emailChangeWarning, setEmailChangeWarning] = useState(false);

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

  function openNew() {
    setEditTarget("new");
    setForm({ email: "", name: "", fundIds: [] });
    setSaveError("");
    setEmailChangeWarning(false);
  }

  function openEdit(lp: Lp) {
    setEditTarget(lp);
    setForm({ email: lp.email, name: lp.name ?? "", fundIds: lp.funds.map((f) => f.id) });
    setSaveError("");
    setEmailChangeWarning(false);
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
        const res = await fetch(`/api/admin/lps/${lp.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, name: form.name || null }),
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
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : lps.length === 0 ? (
        <EmptyState icon={<Handshake className="h-8 w-8" />} title="No LPs yet" description="Add an LP to grant them access to fund reports." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Funds</th>
                <th className="px-3 py-2 font-medium">Added</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lps.map((lp) => (
                <tr key={lp.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{lp.name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{lp.email}</td>
                  <td className="px-3 py-2">
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
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatDate(lp.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(lp)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(lp.id)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-laterite" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && (
        <Modal title={editTarget === "new" ? "New LP" : `Edit — ${(editTarget as Lp).email}`} onClose={() => setEditTarget(null)}>
          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="Email *"
              type="email"
              required
              value={form.email}
              onChange={(e) => {
                setForm((f) => ({ ...f, email: e.target.value }));
                if (editTarget !== "new" && e.target.value.trim().toLowerCase() !== (editTarget as Lp).email) {
                  setEmailChangeWarning(true);
                } else {
                  setEmailChangeWarning(false);
                }
              }}
            />
            {emailChangeWarning && (
              <p className="text-xs text-ochre">Changing this email signs the LP out everywhere — their old sessions are revoked immediately.</p>
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
