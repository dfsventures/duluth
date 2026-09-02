"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichEditor } from "@/components/ui/rich-editor";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";
import { Badge } from "@/components/ui/badge";
import { Table, TableHead, Th, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

interface BroadcastTarget {
  portfolioCompanyId: string;
  portfolioCompany: { id: string; name: string };
}

interface DeliveryRow {
  id: string;
  email: string;
  name: string | null;
  status: "PENDING" | "SENT" | "FAILED";
  error: string | null;
  sentAt: string | null;
}

interface BroadcastDetail {
  id: string;
  subject: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  targets: BroadcastTarget[];
  recipients: DeliveryRow[];
}

interface PortfolioCompanyOption {
  id: string;
  name: string;
  contactCount: number;
}

interface RecipientPreview {
  companyCount: number;
  recipientCount: number;
  companiesWithNoContacts: number | null;
  recipients: { email: string; name: string | null; portfolioCompanyNames?: string[] }[];
}

export default function AdminBroadcastEditorPage() {
  const params = useParams();
  const router = useRouter();
  const broadcastId = params.id as string;

  const [data, setData] = useState<BroadcastDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  const [companies, setCompanies] = useState<PortfolioCompanyOption[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [showRecipientList, setShowRecipientList] = useState(false);

  const [preview, setPreview] = useState<RecipientPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isDraft = data?.status === "DRAFT";
  const skipNextAutosave = useRef(true);

  const loadBroadcast = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/broadcasts/${broadcastId}`);
      if (!res.ok) throw new Error("Failed to load broadcast");
      const d: BroadcastDetail = await res.json();
      setData(d);
      setSubject(d.subject);
      setBody(d.body ?? "");
      skipNextAutosave.current = true;
      setSelectedCompanyIds(d.targets.map((t) => t.portfolioCompanyId));
    } catch {
      setMessage({ type: "error", text: "Failed to load broadcast." });
    } finally {
      setLoading(false);
    }
  }, [broadcastId]);

  const loadCompanies = useCallback(async () => {
    const res = await fetch("/api/admin/portfolio-companies");
    if (res.ok) setCompanies(await res.json());
  }, []);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/broadcasts/${broadcastId}/recipients`);
      if (res.ok) setPreview(await res.json());
    } finally {
      setPreviewLoading(false);
    }
  }, [broadcastId]);

  useEffect(() => {
    loadBroadcast();
    loadCompanies();
  }, [loadBroadcast, loadCompanies]);

  useEffect(() => {
    if (data) loadPreview();
  }, [data, loadPreview]);

  // Debounced auto-save of the audience selection only (subject/body stay
  // manually saved) — the recipient summary and dedup list can only come
  // from the server (WS71's dedup math needs the real contact rows, which
  // the client never holds), so the picker's checked state has to reach
  // the DB before the preview can reflect it.
  useEffect(() => {
    if (!isDraft) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      await fetch(`/api/admin/broadcasts/${broadcastId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioCompanyIds: selectedCompanyIds }),
      });
      await loadPreview();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyIds]);

  function toggleCompany(id: string) {
    setSelectedCompanyIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  const filteredCompanies = useMemo(() => {
    return companies
      .filter((c) => c.name.toLowerCase().includes(pickerSearch.toLowerCase()))
      .filter((c) => !hideEmpty || c.contactCount > 0);
  }, [companies, pickerSearch, hideEmpty]);

  async function handleSave() {
    if (!data) return;
    if (!subject.trim()) {
      setMessage({ type: "error", text: "Subject is required." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/broadcasts/${broadcastId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save");
      }
      setMessage({ type: "success", text: "Draft saved." });
      await loadBroadcast();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    setTestSending(true);
    setMessage(null);
    try {
      // Test send always uses the currently-saved subject/body — save first
      // so "send test" reflects what's on screen, matching the report
      // composer's Save-then-act convention.
      await handleSave();
      const res = await fetch(`/api/admin/broadcasts/${broadcastId}/test`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to send test");
      }
      const d = await res.json();
      setMessage({ type: "success", text: `Test email sent to ${d.sentTo}.` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to send test." });
    } finally {
      setTestSending(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setMessage(null);
    try {
      // Ensure the subject/body on screen are what get sent.
      const saveRes = await fetch(`/api/admin/broadcasts/${broadcastId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body, portfolioCompanyIds: selectedCompanyIds }),
      });
      if (!saveRes.ok) {
        const d = await saveRes.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save before sending");
      }

      const res = await fetch(`/api/admin/broadcasts/${broadcastId}/publish`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to send");
      }
      const d: { sendResult: { recipientCount: number; sent: number; failed: number } } = await res.json();
      setConfirmSend(false);
      setMessage({
        type: "success",
        text: `Sent to ${d.sendResult.sent} contact${d.sendResult.sent === 1 ? "" : "s"}${d.sendResult.failed > 0 ? ` (${d.sendResult.failed} failed)` : ""}.`,
      });
      await loadBroadcast();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to send." });
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteDraft() {
    if (!window.confirm("Delete this draft broadcast? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/broadcasts/${broadcastId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "Failed to delete draft.");
      }
      router.push("/admin/broadcasts");
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to delete draft." });
      setDeleting(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/admin/broadcasts/${broadcastId}/duplicate`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to duplicate");
      }
      const dup = await res.json();
      router.push(`/admin/broadcasts/${dup.id}`);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to duplicate." });
      setDuplicating(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/broadcasts/${broadcastId}/retry`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to retry");
      }
      const d: { attempted: number; sent: number; failed: number } = await res.json();
      setMessage({ type: "success", text: `Retried ${d.attempted} — ${d.sent} sent${d.failed > 0 ? `, ${d.failed} still failed` : ""}.` });
      await loadBroadcast();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to retry." });
    } finally {
      setRetrying(false);
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
        <p className="text-sm text-muted-foreground">Broadcast not found.</p>
        <Button variant="secondary" className="mt-4" onClick={() => router.push("/admin/broadcasts")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Broadcasts
        </Button>
      </AppShell>
    );
  }

  const canSend = subject.trim() !== "" && body.trim() !== "" && selectedCompanyIds.length > 0;
  const hasUnsent = data.recipients.some((r) => r.status === "PENDING" || r.status === "FAILED");

  return (
    <AppShell>
      <button
        onClick={() => router.push("/admin/broadcasts")}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Broadcasts
      </button>

      <ComposerTopBar
        draftLabel={isDraft ? "Draft" : `Sent ${data.publishedAt ? formatDate(data.publishedAt) : ""}`}
        secondaryActions={
          isDraft ? (
            <>
              <Button variant="secondary" size="sm" disabled={saving} onClick={handleSave}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="secondary" size="sm" disabled={testSending || !subject.trim() || !body.trim()} onClick={handleSendTest}>
                {testSending ? "Sending test..." : "Send test to me"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" disabled={duplicating} onClick={handleDuplicate}>
              {duplicating ? "Duplicating..." : "Duplicate as draft"}
            </Button>
          )
        }
        publishLabel="Send"
        onPublishClick={() => setConfirmSend(true)}
        publishDisabled={!isDraft || !canSend}
        publishing={sending}
        overflowItems={
          isDraft
            ? [
                { label: deleting ? "Deleting..." : "Delete draft", onClick: handleDeleteDraft, disabled: deleting, danger: true },
                { label: duplicating ? "Duplicating..." : "Duplicate as draft", onClick: handleDuplicate, disabled: duplicating },
              ]
            : undefined
        }
      />

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success" ? "border-acacia/30 bg-acacia/10 text-acacia" : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {confirmSend && (
        <div className="mb-6 rounded-md border border-ochre/30 bg-ochre/10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ochre">
              This sends the email immediately to {preview?.recipientCount ?? 0} contact{preview?.recipientCount === 1 ? "" : "s"} across{" "}
              {selectedCompanyIds.length} compan{selectedCompanyIds.length === 1 ? "y" : "ies"}. It can&apos;t be unsent.
            </span>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" disabled={sending} onClick={() => setConfirmSend(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={sending} onClick={handleSend}>
                {sending ? "Sending..." : "Send now"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            aria-label="Subject"
            disabled={!isDraft}
            className="w-full border-0 bg-transparent p-0 font-display text-3xl tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 disabled:opacity-80 sm:text-4xl"
          />
        </div>

        {isDraft ? (
          <>
            <RichEditor variant="chromeless" value={body} onChange={setBody} placeholder="Write to your portfolio…" />

            <div className="mt-6 rounded-md border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label className="label">Audience</label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search companies..."
                    className="w-48"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedCompanyIds(companies.map((c) => c.id))}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedCompanyIds([])}>
                    Clear
                  </Button>
                </div>
              </div>
              <label className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={hideEmpty}
                  onChange={(e) => setHideEmpty(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Hide companies with no contacts
              </label>

              {filteredCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No portfolio companies match.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                  {filteredCompanies.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${
                        selectedCompanyIds.includes(c.id) ? "bg-primary/5" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCompanyIds.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="flex-1 min-w-0 text-sm font-medium">{c.name}</span>
                      <span className={`shrink-0 text-xs ${c.contactCount === 0 ? "text-ochre" : "text-muted-foreground"}`}>
                        {c.contactCount} contact{c.contactCount === 1 ? "" : "s"}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <p className="mt-3 text-sm text-muted-foreground">
                {selectedCompanyIds.length} compan{selectedCompanyIds.length === 1 ? "y" : "ies"} selected ·{" "}
                {previewLoading ? "…" : preview?.recipientCount ?? 0} contact{preview?.recipientCount === 1 ? "" : "s"} will receive this
              </p>
              {preview && preview.companiesWithNoContacts !== null && preview.companiesWithNoContacts > 0 && (
                <p className="mt-1 text-sm text-ochre">
                  {preview.companiesWithNoContacts} selected compan{preview.companiesWithNoContacts === 1 ? "y has" : "ies have"} no contacts and will
                  receive nothing.
                </p>
              )}

              {preview && preview.recipients.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowRecipientList((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showRecipientList ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Who will receive this
                  </button>
                  {showRecipientList && (
                    <div className="mt-2 max-h-56 overflow-y-auto rounded-md border divide-y text-sm">
                      {preview.recipients.map((r) => (
                        <div key={r.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <span>
                            {r.name && <span className="font-medium">{r.name} </span>}
                            <span className="font-mono text-xs text-muted-foreground">{r.email}</span>
                          </span>
                          {r.portfolioCompanyNames && (
                            <span className="text-xs text-muted-foreground">{r.portfolioCompanyNames.join(", ")}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="prose prose-sm max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: body }} />

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Delivery</h3>
                {hasUnsent && (
                  <Button size="sm" variant="secondary" disabled={retrying} onClick={handleRetry}>
                    {retrying ? "Retrying..." : "Retry unsent"}
                  </Button>
                )}
              </div>
              <Table tableClassName="min-w-[560px]">
                <TableHead>
                  <Th>Contact</Th>
                  <Th>Status</Th>
                  <Th>Sent</Th>
                </TableHead>
                <tbody>
                  {data.recipients.map((r) => (
                    <TableRow key={r.id}>
                      <td className="px-4 py-2.5">
                        {r.name && <span className="font-medium">{r.name} </span>}
                        <span className="font-mono text-xs text-muted-foreground">{r.email}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={r.status === "SENT" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>{r.status}</Badge>
                        {r.error && <span className="ml-2 text-xs text-laterite">{r.error}</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{r.sentAt ? formatDate(r.sentAt) : "—"}</td>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
