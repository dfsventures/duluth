"use client";

import { useEffect, useState } from "react";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  receivesDigest: boolean;
}

export function DigestRecipientsPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  async function toggle(userId: string, receivesDigest: boolean) {
    setSaving(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receivesDigest }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, receivesDigest } : u))
        );
      }
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading admins…</p>;
  }

  if (users.length === 0) {
    return <p className="text-xs text-muted-foreground">No admin users found.</p>;
  }

  return (
    <ul className="space-y-2">
      {users.map((u) => (
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
              onChange={(e) => toggle(u.id, e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            Receives digest
          </label>
        </li>
      ))}
    </ul>
  );
}
