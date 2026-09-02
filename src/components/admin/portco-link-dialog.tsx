"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addPortcoContact } from "@/lib/portco-link-contact";

export interface PortcoLinkSuggestion {
  companyId: string;
  companyName: string;
  tier: "STRONG" | "MEDIUM" | "WEAK";
  reasons: string[];
}

export interface LinkableCompanyOption {
  id: string;
  name: string;
  createdAt: string;
  portfolioCompanyId: string | null;
  ownerEmail: string;
  ownerName: string | null;
}

interface Props {
  portfolioCompanyId: string;
  portfolioCompanyName: string;
  existingContactEmails: string[];
  onClose: () => void;
  onLinked: (contactAddNote?: string) => void;
}

// Part 31, WS78 — the one link dialog. Used by both the per-company
// widget on /admin/portfolio/[id] (WS78.1) and the standing "Links" tab
// on /admin/portfolio (WS78.2), so there is exactly one place that
// fetches suggestions + the linkable-company list, renders the picker,
// and drives PATCH + the shared D3 contact-add handler
// (src/lib/portco-link-contact.ts, WS79.3) — not two copies.
export function PortcoLinkDialog({
  portfolioCompanyId,
  portfolioCompanyName,
  existingContactEmails,
  onClose,
  onLinked,
}: Props) {
  const [suggestions, setSuggestions] = useState<PortcoLinkSuggestion[]>([]);
  const [companies, setCompanies] = useState<LinkableCompanyOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [addContact, setAddContact] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [suggRes, listRes] = await Promise.all([
          fetch("/api/admin/portfolio-companies/link-suggestions"),
          fetch("/api/admin/companies?linkable=1"),
        ]);
        if (!cancelled && suggRes.ok) {
          const data = await suggRes.json();
          const forThis = (data.results ?? []).find(
            (r: { portfolioCompanyId: string }) => r.portfolioCompanyId === portfolioCompanyId
          );
          setSuggestions(forThis?.matches ?? []);
        }
        if (!cancelled && listRes.ok) {
          setCompanies(await listRes.json());
        }
      } catch {
        // Non-fatal — the dialog is still usable with whichever half loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portfolioCompanyId]);

  const selected = companies.find((c) => c.id === selectedId);
  const alreadyLinkedElsewhere = Boolean(
    selected?.portfolioCompanyId && selected.portfolioCompanyId !== portfolioCompanyId
  );
  const ownerAlreadyContact = selected
    ? existingContactEmails.some((e) => e.toLowerCase() === selected.ownerEmail.toLowerCase())
    : false;

  async function handleConfirm() {
    if (!selectedId || alreadyLinkedElsewhere) return;
    setLinking(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/portfolio-companies/${portfolioCompanyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selectedId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to link company.");
      }

      let contactNote: string | undefined;
      if (addContact && selected && !ownerAlreadyContact) {
        const result = await addPortcoContact(portfolioCompanyId, selected.ownerEmail, selected.ownerName);
        if (!result.ok) contactNote = result.error ?? "Linked, but failed to add the founder as a contact.";
      }

      onLinked(contactNote);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Link {portfolioCompanyName} to a Molly account</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          {suggestions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Suggested matches</p>
              <div className="space-y-1">
                {suggestions.map((m) => (
                  <label
                    key={m.companyId}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                  >
                    <input
                      type="radio"
                      name="linkCandidate"
                      checked={selectedId === m.companyId}
                      onChange={() => setSelectedId(m.companyId)}
                    />
                    <span className="flex-1">{m.companyName}</span>
                    <span className="text-xs text-muted-foreground">{m.tier.toLowerCase()}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Or search all companies</p>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name..." />
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {companies
                .filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
                .slice(0, 25)
                .map((c) => {
                  const linkedElsewhere = c.portfolioCompanyId && c.portfolioCompanyId !== portfolioCompanyId;
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted ${
                        linkedElsewhere ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                      }`}
                    >
                      <input
                        type="radio"
                        name="linkCandidate"
                        checked={selectedId === c.id}
                        onChange={() => setSelectedId(c.id)}
                      />
                      <span className="flex-1">{c.name}</span>
                      {linkedElsewhere && <span className="text-xs text-laterite">already linked</span>}
                    </label>
                  );
                })}
            </div>
          </div>
          {alreadyLinkedElsewhere && (
            <p className="text-xs text-laterite">
              {selected?.name} is already linked to a different portfolio company — unlink it there first.
            </p>
          )}
          {selected && !alreadyLinkedElsewhere && !ownerAlreadyContact && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={addContact}
                onChange={(e) => setAddContact(e.target.checked)}
                className="h-3.5 w-3.5 rounded-sm border-input"
              />
              Also add {selected.ownerEmail} as a contact on {portfolioCompanyName}
            </label>
          )}
          {error && <p className="text-xs text-laterite">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={linking}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={linking || !selectedId || alreadyLinkedElsewhere}
              onClick={handleConfirm}
            >
              {linking ? "Linking..." : "Link"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
