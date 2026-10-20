"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EXPIRY_OPTIONS, expiryFromDays } from "@/lib/expiry-options";
import { formatDate } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { readError } from "./types";

interface LinkRow {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  views: { email: string; viewedAt: string }[];
}

function status(l: LinkRow): { label: string; live: boolean } {
  if (l.revokedAt) return { label: "Turned off", live: false };
  if (l.expiresAt && new Date(l.expiresAt) <= new Date()) return { label: "Expired", live: false };
  return { label: l.expiresAt ? `Expires ${formatDate(l.expiresAt)}` : "Never expires", live: true };
}

/**
 * The owner's external share links. A new link's full URL is shown once, with Copy: Molly stores
 * only a fingerprint of it, so it cannot be shown again (Q120-A). Revoking turns the link off but
 * keeps its view log.
 */
export function ShareLinksSection({ memoId }: { memoId: string }) {
  const confirm = useConfirm();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number | null>(30);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/memos/${memoId}/links`);
      if (!res.ok) throw new Error(await readError(res, "Couldn't load the links."));
      setLinks(await res.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the links.");
    }
  }, [memoId]);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/memos/${memoId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, expiresAt: expiryFromDays(days) }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't create the link."));
      const { url } = await res.json();
      setCreated(url);
      setLabel("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the link.");
    } finally {
      setCreating(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  async function revoke(l: LinkRow) {
    if (
      !(await confirm({
        title: "Turn off this link",
        description: "Anyone who opens it will see that it was turned off. Its view history stays here.",
        confirmLabel: "Turn off link",
      }))
    )
      return;
    const res = await fetch(`/api/admin/memos/${memoId}/links/${l.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await readError(res, "Couldn't turn off the link."));
      return;
    }
    toast.success("Link turned off.");
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-sm font-semibold text-foreground">Links for people outside DFS</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Anyone with a link can read the sections marked &quot;Include in share links&quot;. No sign-in. The link always shows the latest text.
        </p>
      </div>

      <div className="space-y-3 border border-border p-3">
        <Input id="link-label" label="Label (optional)" value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} placeholder="Co-investor review" />
        <div className="space-y-1">
          <label htmlFor="link-expiry" className="label">
            Expires
          </label>
          <select id="link-expiry" className="input-field" value={days === null ? "never" : String(days)} onChange={(e) => setDays(e.target.value === "never" ? null : Number(e.target.value))}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.label} value={o.days === null ? "never" : String(o.days)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={create} loading={creating}>
          New link
        </Button>
      </div>

      {created && (
        <div role="status" className="space-y-2 border border-edge bg-muted/40 p-3">
          <p className="text-sm font-medium text-foreground">Copy this link now.</p>
          <p className="select-all break-all font-mono text-xs text-foreground">{created}</p>
          <p className="text-xs text-muted-foreground">Molly stores only a fingerprint of this link, so copy it now. If you lose it, create another.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => copy(created)}>
              <Copy className="h-4 w-4" />
              Copy link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {links && links.length === 0 && <p className="text-sm text-muted-foreground">No links yet.</p>}
      <ul className="space-y-2">
        {(links ?? []).map((l) => {
          const st = status(l);
          return (
            <li key={l.id} className="border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{l.label || "Untitled link"}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(l.createdAt)} · <span className="num font-mono">{l.viewCount}</span> {l.viewCount === 1 ? "view" : "views"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={st.live ? "success" : "neutral"}>{st.label}</Badge>
                  {st.live && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(l)}>
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
              {l.views.length > 0 && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Who opened it</summary>
                  <ul className="mt-1 space-y-0.5">
                    {l.views.map((v, i) => (
                      <li key={i}>
                        <span className="font-mono">{v.email}</span> · {new Date(v.viewedAt).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
