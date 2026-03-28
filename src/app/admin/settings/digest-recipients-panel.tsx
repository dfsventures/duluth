"use client";

import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  receivesDigest: boolean;
}

interface ExtraRecipient {
  id: string;
  email: string;
}

export function DigestRecipientsPanel() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [extras, setExtras] = useState<ExtraRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/digest-recipients").then((r) => r.json()),
    ])
      .then(([a, e]) => {
        setAdmins(a);
        setExtras(e);
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggleAdmin(userId: string, receivesDigest: boolean) {
    setSaving(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receivesDigest }),
      });
      if (res.ok) {
        setAdmins((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, receivesDigest } : u))
        );
      }
    } finally {
      setSaving(null);
    }
  }

  async function addExtra() {
    if (!newEmail.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/admin/digest-recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setAddError(body?.error ?? "Failed to add");
        return;
      }
      const recipient = await res.json();
      setExtras((prev) => [...prev, recipient]);
      setNewEmail("");
    } finally {
      setAdding(false);
    }
  }

  async function removeExtra(id: string) {
    await fetch(`/api/admin/digest-recipients/${id}`, { method: "DELETE" });
    setExtras((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-5">
      {/* Admin users */}
      {admins.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Team admins</p>
          <ul className="space-y-2">
            {admins.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{u.name ?? u.email}</p>
                  {u.name && <p className="text-xs text-muted-foreground">{u.email}</p>}
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    checked={u.receivesDigest}
                    disabled={saving === u.id}
                    onChange={(e) => toggleAdmin(u.id, e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-primary"
                  />
                  Receives digest
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Extra recipients */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Additional recipients</p>

        {extras.length > 0 && (
          <ul className="mb-3 space-y-2">
            {extras.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-4 py-2.5"
              >
                <span className="text-sm text-foreground">{e.email}</span>
                <button
                  onClick={() => removeExtra(e.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            type="email"
            className="input-field flex-1 text-sm"
            placeholder="name@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addExtra()}
          />
          <Button size="sm" variant="secondary" onClick={addExtra} disabled={adding || !newEmail.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {addError && <p className="mt-1.5 text-xs text-destructive">{addError}</p>}
      </div>
    </div>
  );
}
