"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers, History, TrendingUp, Plus, X, Pencil, Trash2, Users, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, Th, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { parseContactsCSV } from "@/lib/csv";
import { PortcoLinkDialog } from "@/components/admin/portco-link-dialog";

const ROUND_KINDS = ["UNKNOWN", "PRICED", "SAFE", "CONVERSION", "OTHER"];

interface Deal {
  id: string;
  fund: { id: string; name: string; slug: string };
  investmentType: "INITIAL" | "FOLLOW_ON";
  dealDate: string;
  amountUsd: number;
  instrument: string | null;
  entryValuation: number | null;
  currentValuation: number | null;
  valuationAsOf: string | null;
  roundId: string | null;
  round: { id: string; label: string | null; kind: string } | null;
  ownershipPct: number | null;
  positionValue: number | null;
  dilutionAware: boolean;
}

interface Round {
  id: string;
  label: string | null;
  kind: string;
  roundDate: string;
  raisedUsd: number | null;
  preMoneyUsd: number | null;
  postMoneyUsd: number | null;
  source: string;
  notes: string | null;
}

interface Mark {
  id: string;
  valuationUsd: number;
  asOf: string;
  source: string;
  notes: string | null;
}

interface Position {
  fund: { id: string; name: string; slug: string };
  invested: number;
  dealCount: number;
  latestMultiple: number | null;
  impliedValue: number;
  dilutionAware: boolean;
}

interface Contact {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
}

interface CompanyDetail {
  id: string;
  name: string;
  country: string | null;
  company: { id: string; name: string } | null;
  deals: Deal[];
  rounds: Round[];
  marks: Mark[];
  latestValuation: number | null;
  positions: Position[];
  contacts: Contact[];
}

interface ContactsImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  unmatchedCompanies: string[];
}

function multipleLabel(m: number | null): string {
  if (m === null) return "n/a";
  if (m === 0) return "Written off";
  return `${m.toFixed(1)}×`;
}

export default function AdminPortfolioCompanyPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;

  const [data, setData] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showRoundModal, setShowRoundModal] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [roundForm, setRoundForm] = useState({ label: "", kind: "UNKNOWN", roundDate: "", raisedUsd: "", preMoneyUsd: "", postMoneyUsd: "", notes: "" });
  const [savingRound, setSavingRound] = useState(false);
  const [roundError, setRoundError] = useState("");

  const [markForm, setMarkForm] = useState({ valuationUsd: "", asOf: "", notes: "" });
  const [savingMark, setSavingMark] = useState(false);
  const [markError, setMarkError] = useState("");

  // Part 30, WS70.4 — Contacts section state.
  const [contactForm, setContactForm] = useState({ name: "", email: "", role: "" });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ContactsImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const contactsFileInputRef = useRef<HTMLInputElement>(null);

  // Part 31, WS78.1 — the first writer UI for PortfolioCompany.companyId
  // (F65). The picker itself is the shared PortcoLinkDialog (WS78/WS79.3)
  // used identically by the Links tab on /admin/portfolio.
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/portfolio/companies/${companyId}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  function openNewRound() {
    setEditingRound(null);
    setRoundForm({ label: "", kind: "UNKNOWN", roundDate: "", raisedUsd: "", preMoneyUsd: "", postMoneyUsd: "", notes: "" });
    setRoundError("");
    setShowRoundModal(true);
  }

  function openEditRound(r: Round) {
    setEditingRound(r);
    setRoundForm({
      label: r.label ?? "",
      kind: r.kind,
      roundDate: r.roundDate.slice(0, 10),
      raisedUsd: r.raisedUsd !== null ? String(r.raisedUsd) : "",
      preMoneyUsd: r.preMoneyUsd !== null ? String(r.preMoneyUsd) : "",
      postMoneyUsd: r.postMoneyUsd !== null ? String(r.postMoneyUsd) : "",
      notes: r.notes ?? "",
    });
    setRoundError("");
    setShowRoundModal(true);
  }

  async function handleSaveRound(e: React.FormEvent) {
    e.preventDefault();
    setSavingRound(true);
    setRoundError("");
    try {
      const body = {
        portfolioCompanyId: companyId,
        label: roundForm.label.trim() || null,
        kind: roundForm.kind,
        roundDate: roundForm.roundDate,
        raisedUsd: roundForm.raisedUsd || null,
        preMoneyUsd: roundForm.preMoneyUsd || null,
        postMoneyUsd: roundForm.postMoneyUsd || null,
        notes: roundForm.notes.trim() || null,
      };
      const res = editingRound
        ? await fetch(`/api/admin/rounds/${editingRound.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/admin/rounds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save round");
      }
      setShowRoundModal(false);
      load();
    } catch (err) {
      setRoundError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingRound(false);
    }
  }

  async function handleDeleteRound(id: string) {
    if (!window.confirm("Delete this round? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/rounds/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setMessage({ type: "error", text: d?.error ?? "Failed to delete round." });
      return;
    }
    load();
  }

  async function handleAssignRound(dealId: string, roundId: string) {
    const res = await fetch(`/api/admin/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: roundId || null }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setMessage({ type: "error", text: d?.error ?? "Failed to assign round." });
      return;
    }
    load();
  }

  async function handleSaveOwnership(dealId: string, value: string) {
    const res = await fetch(`/api/admin/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownershipPct: value === "" ? null : Number(value) }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setMessage({ type: "error", text: d?.error ?? "Failed to update ownership." });
      return;
    }
    load();
  }

  async function handleRecordMark(e: React.FormEvent) {
    e.preventDefault();
    setSavingMark(true);
    setMarkError("");
    try {
      const res = await fetch(`/api/admin/portfolio-companies/${companyId}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valuationUsd: markForm.valuationUsd,
          asOf: markForm.asOf || undefined,
          notes: markForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to record mark");
      }
      setMarkForm({ valuationUsd: "", asOf: "", notes: "" });
      load();
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingMark(false);
    }
  }

  async function handleDeleteMark(id: string) {
    if (!window.confirm("Delete this valuation-mark record? This only removes history — it does not change the current valuation.")) return;
    await fetch(`/api/admin/marks/${id}`, { method: "DELETE" });
    load();
  }

  // Part 30, WS70.4 — Contacts section handlers.
  function startEditContact(c: Contact) {
    setEditingContactId(c.id);
    setContactForm({ name: c.name ?? "", email: c.email, role: c.role ?? "" });
    setContactError("");
  }

  function cancelEditContact() {
    setEditingContactId(null);
    setContactForm({ name: "", email: "", role: "" });
    setContactError("");
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    const email = contactForm.email.trim();
    if (!email) return;
    setSavingContact(true);
    setContactError("");
    try {
      const isEditing = editingContactId !== null;
      const res = await fetch(`/api/admin/portfolio-companies/${companyId}/contacts`, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEditing
            ? { id: editingContactId, name: contactForm.name.trim() || null, email, role: contactForm.role.trim() || null }
            : { name: contactForm.name.trim() || null, email, role: contactForm.role.trim() || null }
        ),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save contact");
      }
      cancelEditContact();
      load();
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingContact(false);
    }
  }

  async function handleDeleteContact(id: string) {
    if (!window.confirm("Remove this contact? They will no longer receive broadcasts to this company.")) return;
    await fetch(`/api/admin/portfolio-companies/${companyId}/contacts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function handleContactsCSVFile(file: File) {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const text = await file.text();
      const rows = parseContactsCSV(text);
      if (rows.length === 0) {
        setImportError('No valid rows found. CSV must have an "email" column.');
        return;
      }
      const res = await fetch("/api/admin/portfolio-companies/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: rows, defaultPortfolioCompanyId: companyId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Import failed");
      }
      const result: ContactsImportResult = await res.json();
      setImportResult(result);
      if (result.created > 0 || result.updated > 0) load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (contactsFileInputRef.current) contactsFileInputRef.current.value = "";
    }
  }

  // Part 31, WS78.1 — link/unlink handlers. The picker UI itself is the
  // shared PortcoLinkDialog (rendered below).
  function handleLinked(contactNote?: string) {
    setShowLinkModal(false);
    if (contactNote) setMessage({ type: "error", text: contactNote });
    load();
  }

  async function handleUnlink() {
    setUnlinking(true);
    try {
      const res = await fetch(`/api/admin/portfolio-companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setMessage({ type: "error", text: d?.error ?? "Failed to unlink." });
        return;
      }
      setShowUnlinkConfirm(false);
      load();
    } finally {
      setUnlinking(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <Button variant="secondary" onClick={() => router.push("/admin/portfolio")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Portfolio
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <button
        onClick={() => router.push("/admin/portfolio")}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Portfolio
      </button>

      {message && (
        <div
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${
            message.type === "success" ? "border-acacia/30 bg-acacia/10 text-acacia" : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-6 rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{data.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {data.country && <span>{data.country}</span>}
              {data.latestValuation !== null && <span>Latest valuation ${data.latestValuation.toLocaleString()}</span>}
              {data.company ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span>Molly account: {data.company.name}</span>
                  <Link href={`/admin/companies/${data.company.id}`} className="text-primary hover:underline">
                    View operational company profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => setShowUnlinkConfirm(true)}
                    className="text-laterite hover:underline"
                  >
                    Unlink
                  </button>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <span>Molly account: not linked</span>
                  <button type="button" onClick={() => setShowLinkModal(true)} className="text-primary hover:underline">
                    Link…
                  </button>
                </span>
              )}
            </div>
            {showUnlinkConfirm && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-ochre/30 bg-ochre/10 px-3 py-2 text-sm text-ochre">
                <span>Unlink {data.company?.name} from this portfolio company?</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={unlinking} onClick={() => setShowUnlinkConfirm(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" size="sm" disabled={unlinking} onClick={handleUnlink}>
                    {unlinking ? "Unlinking..." : "Confirm Unlink"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contacts (Part 30, WS70.4) — people first, then numbers */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Users className="h-4 w-4" />
          Contacts
        </h3>

        {importResult && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-acacia/30 bg-acacia/10 px-4 py-3 text-sm text-acacia">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <span className="font-medium">Import complete.</span> {importResult.created} created, {importResult.updated} updated
              {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}.
              {importResult.unmatchedCompanies.length > 0 && (
                <p className="mt-1">Unmatched companies: {importResult.unmatchedCompanies.join(", ")}</p>
              )}
              {importResult.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-laterite">
                  {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
            <button onClick={() => setImportResult(null)}>
              <X className="h-4 w-4 opacity-50 hover:opacity-100" />
            </button>
          </div>
        )}
        {importError && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-laterite">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{importError}</span>
            <button onClick={() => setImportError(null)}>
              <X className="h-4 w-4 opacity-50 hover:opacity-100" />
            </button>
          </div>
        )}

        {data.contacts.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No contacts yet — broadcasts to this company would reach nobody." />
        ) : (
          <div className="mb-3 space-y-1.5">
            {data.contacts.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border px-2.5 py-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {c.name && <span className="font-medium">{c.name}</span>}
                  <span className="font-mono text-xs">{c.email}</span>
                  {c.role && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{c.role}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEditContact(c)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDeleteContact(c.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-laterite" title="Remove">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSaveContact} className="rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="text"
              placeholder="Name"
              value={contactForm.name}
              onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
              className="input-field"
            />
            <input
              type="email"
              placeholder="Email *"
              required
              value={contactForm.email}
              onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
              className="input-field"
            />
            <input
              type="text"
              placeholder="Role (optional)"
              value={contactForm.role}
              onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))}
              className="input-field"
            />
            <Button type="submit" size="sm" disabled={savingContact || !contactForm.email.trim()}>
              {savingContact ? "Saving..." : editingContactId ? "Save" : "Add"}
            </Button>
            {editingContactId && (
              <Button type="button" variant="secondary" size="sm" onClick={cancelEditContact}>
                Cancel
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={importing}
              onClick={() => contactsFileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {importing ? "Importing..." : "Import CSV"}
            </Button>
            <input
              ref={contactsFileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleContactsCSVFile(file);
              }}
            />
          </div>
          {contactError && <p className="mt-2 text-xs text-laterite">{contactError}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            CSV columns: <code className="rounded bg-muted px-1">name</code>,{" "}
            <code className="rounded bg-muted px-1">email</code>, optional{" "}
            <code className="rounded bg-muted px-1">role</code>. A{" "}
            <code className="rounded bg-muted px-1">company</code> column is optional here — rows without one are added to this
            company.
          </p>
        </form>
      </div>

      {/* Positions (computed, per fund) */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <TrendingUp className="h-4 w-4" />
          Positions by fund
        </h3>
        {data.positions.length === 0 ? (
          <EmptyState icon={<Layers className="h-6 w-6" />} title="No positions yet" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.positions.map((p) => (
              <div key={p.fund.id} className="rounded-md border border-border bg-card p-3">
                <Link href={`/admin/funds/${p.fund.id}`} className="text-sm font-medium hover:underline">
                  {p.fund.name}
                </Link>
                <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>${p.invested.toLocaleString()} invested</span>
                  <span>{p.dealCount} deal{p.dealCount !== 1 ? "s" : ""}</span>
                  <span>{multipleLabel(p.latestMultiple)}</span>
                  <span className="inline-flex items-center gap-1.5">
                    ${Math.round(p.impliedValue).toLocaleString()} implied
                    {!p.dilutionAware && <span className="h-1.5 w-1.5 rounded-full bg-ochre" title="No dilution data recorded" />}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deals across funds */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Layers className="h-4 w-4" />
          Deals across funds
        </h3>
        {data.deals.length === 0 ? (
          <EmptyState icon={<Layers className="h-6 w-6" />} title="No deals yet" />
        ) : (
          <Table tableClassName="min-w-[960px]">
            <TableHead>
              <Th>Fund</Th>
              <Th>Type</Th>
              <Th>Date</Th>
              <Th>Amount</Th>
              <Th>Round</Th>
              <Th>Ownership %</Th>
              <Th>Position Value</Th>
            </TableHead>
            <tbody>
              {data.deals.map((d) => (
                <TableRow key={d.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/admin/funds/${d.fund.id}`} className="hover:underline">
                      {d.fund.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={d.investmentType === "INITIAL" ? "info" : "neutral"}>
                      {d.investmentType === "INITIAL" ? "Initial" : "Follow-on"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(d.dealDate)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">${d.amountUsd.toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={d.roundId ?? ""}
                      onChange={(e) => handleAssignRound(d.id, e.target.value)}
                      className="rounded-sm border border-input bg-card px-2 py-1 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {data.rounds.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label ?? formatDate(r.roundDate)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      defaultValue={d.ownershipPct ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== String(d.ownershipPct ?? "")) handleSaveOwnership(d.id, e.target.value);
                      }}
                      placeholder="—"
                      className="w-20 rounded-sm border border-input bg-card px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {d.positionValue !== null ? `$${Math.round(d.positionValue).toLocaleString()}` : "—"}
                      {!d.dilutionAware && d.positionValue !== null && (
                        <span className="h-1.5 w-1.5 rounded-full bg-ochre" title="No dilution data — zero-dilution assumption (amount x multiple)" />
                      )}
                    </span>
                  </td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {/* Rounds timeline */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <History className="h-4 w-4" />
            Financing rounds
          </h3>
          <Button size="sm" onClick={openNewRound}>
            <Plus className="mr-2 h-4 w-4" />
            New Round
          </Button>
        </div>
        {data.rounds.length === 0 ? (
          <EmptyState icon={<History className="h-6 w-6" />} title="No rounds recorded" />
        ) : (
          <div className="space-y-2">
            {data.rounds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{r.label ?? "Untitled round"}</span>
                    <Badge variant="neutral">{r.kind}</Badge>
                    {r.source === "BACKFILL" && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">backfilled</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(r.roundDate)}</span>
                    {r.raisedUsd !== null && <span>Raised ${r.raisedUsd.toLocaleString()}</span>}
                    {r.postMoneyUsd !== null && <span>Post-money ${r.postMoneyUsd.toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => openEditRound(r)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDeleteRound(r.id)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-laterite" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Valuation marks */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <TrendingUp className="h-4 w-4" />
          Valuation history
        </h3>
        {data.marks.length === 0 ? (
          <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No valuation marks yet" />
        ) : (
          <div className="mb-4 space-y-2">
            {data.marks.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">${m.valuationUsd.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(m.asOf)}</span>
                  {m.source === "BACKFILL" && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">backfilled</span>}
                  {m.source === "SHEET" && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">from sheet</span>}
                </div>
                <button onClick={() => handleDeleteMark(m.id)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-laterite" title="Delete (history only)">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleRecordMark} className="rounded-md border border-border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Recording a mark updates the current valuation on all of this company&apos;s deals.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="Valuation (USD)"
              type="number"
              min={0}
              value={markForm.valuationUsd}
              onChange={(e) => setMarkForm({ ...markForm, valuationUsd: e.target.value })}
              required
            />
            <Input
              label="As of"
              type="date"
              value={markForm.asOf}
              onChange={(e) => setMarkForm({ ...markForm, asOf: e.target.value })}
            />
            <Input
              label="Notes (optional)"
              value={markForm.notes}
              onChange={(e) => setMarkForm({ ...markForm, notes: e.target.value })}
            />
            <Button type="submit" size="sm" disabled={savingMark}>
              {savingMark ? "Recording..." : "Record mark"}
            </Button>
          </div>
          {markError && <p className="mt-2 text-xs text-laterite">{markError}</p>}
        </form>
      </div>

      {showRoundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRoundModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-semibold text-foreground">{editingRound ? "Edit Round" : "New Round"}</h2>
              <button onClick={() => setShowRoundModal(false)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveRound} className="space-y-3 px-6 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Label" value={roundForm.label} onChange={(e) => setRoundForm({ ...roundForm, label: e.target.value })} placeholder="Seed, Series A, SAFE (2024)..." />
                <Select id="roundKind" label="Kind" value={roundForm.kind} onChange={(e) => setRoundForm({ ...roundForm, kind: e.target.value })}>
                  {ROUND_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </Select>
              </div>
              <Input label="Round date" type="date" value={roundForm.roundDate} onChange={(e) => setRoundForm({ ...roundForm, roundDate: e.target.value })} required />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input label="Raised (USD)" type="number" value={roundForm.raisedUsd} onChange={(e) => setRoundForm({ ...roundForm, raisedUsd: e.target.value })} />
                <Input label="Pre-money (USD)" type="number" value={roundForm.preMoneyUsd} onChange={(e) => setRoundForm({ ...roundForm, preMoneyUsd: e.target.value })} />
                <Input label="Post-money (USD)" type="number" value={roundForm.postMoneyUsd} onChange={(e) => setRoundForm({ ...roundForm, postMoneyUsd: e.target.value })} />
              </div>
              <Input label="Notes" value={roundForm.notes} onChange={(e) => setRoundForm({ ...roundForm, notes: e.target.value })} />
              {roundError && <p className="text-xs text-laterite">{roundError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowRoundModal(false)} disabled={savingRound}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={savingRound}>
                  {savingRound ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLinkModal && (
        <PortcoLinkDialog
          portfolioCompanyId={companyId}
          portfolioCompanyName={data.name}
          existingContactEmails={data.contacts.map((c) => c.email)}
          onClose={() => setShowLinkModal(false)}
          onLinked={handleLinked}
        />
      )}
    </AppShell>
  );
}
