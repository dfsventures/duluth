"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichEditor } from "@/components/ui/rich-editor";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";
import { PageHeader, StatusItems } from "@/components/layout/page-header";
import { DetailMenu } from "@/components/layout/page-header-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { noticeClasses } from "@/components/ui/notice";
import { PickerList } from "@/components/ui/picker-list";
import { Table, TableHead, Th, TableRow } from "@/components/ui/table";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { cn, formatDate } from "@/lib/utils";
import { useNewLook } from "@/lib/use-new-look";
import { EDITOR_COLUMN, EDITOR_TITLE } from "@/lib/editor-styles";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useFlashMessage } from "@/lib/use-flash-message";
import { PageSkeleton } from "@/components/ui/skeleton";

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
  senderLabel: string | null;
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

// New look (WS172): the delivery list as the shared table. Same three columns as the old one.
const deliveryColumns: DataTableColumn<DeliveryRow>[] = [
  {
    key: "contact",
    header: "Contact",
    sortValue: (r) => r.email,
    title: (r) => (r.name ? `${r.name} ${r.email}` : r.email),
    cell: (r) => (
      <>
        {r.name && <span className="font-medium">{r.name} </span>}
        <span className="text-meta text-muted-foreground">{r.email}</span>
      </>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortValue: (r) => r.status,
    mobile: "badge",
    cell: (r) => (
      <>
        <Badge variant={r.status === "SENT" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>{r.status}</Badge>
        {r.error && <span className="ml-2 text-xs text-tone-clay-ink">{r.error}</span>}
      </>
    ),
  },
  {
    key: "sent",
    header: "Sent",
    sortValue: (r) => (r.sentAt ? new Date(r.sentAt).getTime() : 0),
    firstDir: "desc",
    className: "whitespace-nowrap",
    mobile: "meta",
    cell: (r) => (r.sentAt ? formatDate(r.sentAt) : "—"),
  },
];

// New look (audit #23): the subject is a textarea that grows with its text, so a long one is never cut off.
function GrowTitle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      placeholder="Subject"
      aria-label="Subject"
      data-align="title"
      className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-sans text-doc-title text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
    />
  );
}

const SEND_DISABLED_REASON = "Add a subject, a message and at least one company to send.";

export default function AdminBroadcastEditorPage() {
  const newLook = useNewLook();
  const [sentTab, setSentTab] = useState<"message" | "delivery">("message");
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
  const [, setMessage] = useFlashMessage();

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
  }, [broadcastId, setMessage]);

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

  const confirm = useConfirm();
  async function handleDeleteDraft() {
    if (!(await confirm({ title: "Delete this draft broadcast", description: "This cannot be undone.", confirmLabel: "Delete draft" }))) return;
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
      setMessage({ type: "success", text: `Retried ${d.attempted}: ${d.sent} sent${d.failed > 0 ? `, ${d.failed} still failed` : ""}.` });
      await loadBroadcast();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to retry." });
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <AppShell width="narrow">
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell width="narrow">
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
  const deliveredCount = data.recipients.filter((r) => r.status === "SENT").length;
  const failedCount = data.recipients.filter((r) => r.status === "FAILED").length;
  // New look (audit #21): the subject or body differs from what was loaded.
  const dirty = isDraft && (subject !== data.subject || body !== (data.body ?? ""));
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <AppShell width="narrow">
      {!newLook && <Breadcrumb items={[{ label: "Broadcasts", href: "/admin/broadcasts" }, { label: subject.trim() || "Untitled broadcast" }]} />}

      {/* Page types v1: a sent broadcast is a Detail page (no panel, 720); a draft keeps the editor bar. */}
      {newLook && !isDraft && (
        <PageHeader
          type="detail"
          back={{ href: "/admin/broadcasts", label: "Broadcasts" }}
          title={subject.trim() || "Untitled broadcast"}
          status={
            <StatusItems
              items={[
                `Sent ${data.publishedAt ? formatDate(data.publishedAt) : ""}${data.senderLabel ? ` by ${data.senderLabel}` : ""}`.trim(),
                <span key="reach" className="whitespace-nowrap">
                  {plural(data.recipients.length, "contact", "contacts")} at {plural(data.targets.length, "company", "companies")}: {deliveredCount} delivered
                  {failedCount > 0 && (
                    <>
                      ,{" "}
                      <button type="button" onClick={() => setSentTab("delivery")} className="whitespace-nowrap text-tone-clay-ink underline-offset-2 hover:underline">
                        {failedCount} failed
                      </button>
                    </>
                  )}
                </span>,
              ]}
            />
          }
          // A sent broadcast has no primary action (audit #22), so its actions live in the ⋯ menu.
          condensedAction={null}
          action={
            <DetailMenu>
              <DropdownMenuItem onSelect={handleDuplicate} disabled={duplicating}>
                {duplicating ? "Duplicating..." : "Duplicate as draft"}
              </DropdownMenuItem>
              {hasUnsent && (
                <DropdownMenuItem onSelect={handleRetry} disabled={retrying}>
                  {retrying ? "Retrying..." : "Retry unsent"}
                </DropdownMenuItem>
              )}
            </DetailMenu>
          }
        />
      )}
      {(isDraft || !newLook) && (
      <ComposerTopBar
        back={{ href: "/admin/broadcasts", label: "Broadcasts" }}
        statusExtra={dirty ? <span className="hidden text-tone-amber-ink v2:inline">Unsaved changes</span> : undefined}
        // New look (audit #22): a sent broadcast has nothing left to send, so no Send, not even a disabled one.
        showPublish={isDraft || !newLook}
        disabledReason={newLook ? SEND_DISABLED_REASON : undefined}
        draftLabel={
          isDraft
            ? "Draft"
            : newLook
              ? "Sent"
              : `Sent ${data.publishedAt ? formatDate(data.publishedAt) : ""}${data.senderLabel ? ` by ${data.senderLabel}` : ""}`
        }
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
        // Phone, new look (§6): Save and Send test fold into ⋯.
        phoneMenuItems={
          isDraft
            ? [
                { label: saving ? "Saving..." : "Save", onClick: handleSave, disabled: saving },
                {
                  label: testSending ? "Sending test..." : "Send test to me",
                  onClick: handleSendTest,
                  disabled: testSending || !subject.trim() || !body.trim(),
                },
              ]
            : undefined
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
      )}

      {confirmSend && (
        <div className={noticeClasses("amber", cn("mb-6", EDITOR_COLUMN))}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-foreground">
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

      <div className={cn("mx-auto max-w-3xl", EDITOR_COLUMN)}>
        <div className={cn("mb-6 v2:mb-4", newLook && !isDraft && "hidden")}>
          {newLook ? (
            // New look (audit #23): the subject wraps instead of being cut off. A sent one's title is the page header.
            isDraft ? (
              <GrowTitle value={subject} onChange={setSubject} />
            ) : null
          ) : (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              aria-label="Subject"
              disabled={!isDraft}
              className={cn("w-full border-0 bg-transparent p-0 font-display text-3xl tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 disabled:opacity-80 sm:text-4xl", EDITOR_TITLE, "sm:v2:text-title")}
            />
          )}
        </div>

        {newLook && isDraft && !canSend && <p className="-mt-2 mb-4 text-meta text-muted-foreground">{SEND_DISABLED_REASON}</p>}

        {newLook && !isDraft && (
          <>
            {/* Audit #24 (who it reached) is now the header's status line; Retry unsent is a header action. */}
            {/* Audit #25: Message / Delivery. */}
            <div role="tablist" aria-label="Broadcast sections" data-align="tabs" className="page-tabs mb-6 flex gap-5">
              {(
                [
                  { key: "message", label: "Message" },
                  { key: "delivery", label: "Delivery", count: data.recipients.length },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={sentTab === t.key}
                  onClick={() => setSentTab(t.key)}
                  className={cn(
                    "border-b-2 border-transparent py-2.5 text-row font-medium text-muted-foreground hover:text-foreground",
                    sentTab === t.key && "border-primary text-foreground"
                  )}
                >
                  {t.label}
                  {"count" in t && <span className="num ml-1.5 font-normal text-muted-foreground">{t.count}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {isDraft ? (
          <>
            <RichEditor variant="chromeless" value={body} onChange={setBody} placeholder="Write to your portfolio…" />

            {newLook ? (
              // New look (audit #1, #2): a heading row, one control row, one hairline list, two summary lines.
              <section aria-labelledby="audience-heading" className="mt-8 border-t border-border pt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="audience-heading" className="text-row font-medium text-foreground">
                    Audience
                  </h2>
                  <span className="text-meta text-muted-foreground">{selectedCompanyIds.length} selected</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search companies"
                    aria-label="Search companies"
                    className="v2:h-9 w-60 bg-transparent"
                  />
                  <Button type="button" variant="secondary" className="v2:h-9" onClick={() => setSelectedCompanyIds(companies.map((c) => c.id))}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" className="v2:h-9" onClick={() => setSelectedCompanyIds([])}>
                    Clear
                  </Button>
                  <label className="flex items-center gap-2 text-row text-muted-foreground md:ml-2">
                    <input
                      type="checkbox"
                      checked={hideEmpty}
                      onChange={(e) => setHideEmpty(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    Hide companies with no contacts
                  </label>
                </div>
                <div className="mt-3">
                  {filteredCompanies.length === 0 ? (
                    <p className="text-row text-muted-foreground">No portfolio companies match.</p>
                  ) : (
                    <PickerList
                      ariaLabel="Companies to send to"
                      items={filteredCompanies.map((c) => ({
                        id: c.id,
                        label: c.name,
                        meta: `${c.contactCount} contact${c.contactCount === 1 ? "" : "s"}`,
                        warn: c.contactCount === 0,
                      }))}
                      selected={selectedCompanyIds}
                      onToggle={toggleCompany}
                    />
                  )}
                </div>
                <p className="mt-3 text-row text-muted-foreground">
                  {plural(selectedCompanyIds.length, "company", "companies")} selected ·{" "}
                  {previewLoading ? "…" : preview?.recipientCount ?? 0} contact{preview?.recipientCount === 1 ? "" : "s"} will receive this
                </p>
                {preview && preview.companiesWithNoContacts !== null && preview.companiesWithNoContacts > 0 && (
                  <p className="mt-1 text-row text-foreground">
                    {preview.companiesWithNoContacts} selected compan{preview.companiesWithNoContacts === 1 ? "y has" : "ies have"} no contacts and will
                    receive nothing.
                  </p>
                )}
                {preview && preview.recipients.length > 0 && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setShowRecipientList((v) => !v)}
                      aria-expanded={showRecipientList}
                      className="flex items-center gap-1 text-row font-medium text-foreground"
                    >
                      {showRecipientList ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Who will receive this
                    </button>
                    {showRecipientList && (
                      <PickerList
                        className="mt-2"
                        ariaLabel="Who will receive this"
                        items={preview.recipients.map((r) => ({
                          id: r.email,
                          label: r.name ?? r.email,
                          sub: r.name ? r.email : undefined,
                          meta: r.portfolioCompanyNames?.join(", "),
                        }))}
                      />
                    )}
                  </div>
                )}
              </section>
            ) : (
            <div className="mt-6 rounded-md border border-border bg-card p-4 v2:mt-8 v2:rounded-none v2:border-0 v2:border-t v2:bg-transparent v2:p-0 v2:pt-6">
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
                <div className="max-h-72 overflow-y-auto rounded-md border divide-y v2:rounded-none v2:border-x-0">
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
                      <span className={`shrink-0 text-xs ${c.contactCount === 0 ? "text-tone-amber-ink" : "text-muted-foreground"}`}>
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
                <p className="mt-1 text-sm text-foreground">
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
            )}
          </>
        ) : (
          <>
            <div
              hidden={newLook && sentTab !== "message"}
              className="prose prose-sm max-w-none leading-relaxed"
              dangerouslySetInnerHTML={{ __html: body }}
            />

            <div hidden={newLook && sentTab !== "delivery"} className="mt-8 v2:mt-0">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold v2:text-meta">Delivery</h3>
                {hasUnsent && (
                  <Button size="sm" variant="secondary" disabled={retrying} onClick={handleRetry}>
                    {retrying ? "Retrying..." : "Retry unsent"}
                  </Button>
                )}
              </div>
              {newLook ? (
                <DataTable<DeliveryRow>
                  label="Delivery"
                  noun="recipient"
                  rows={data.recipients}
                  rowKey={(r) => r.id}
                  columns={deliveryColumns}
                  defaultSort={{ key: "contact", dir: "asc" }}
                  urlState={false}
                  minWidth={480}
                  empty={<p className="py-6 text-sm text-muted-foreground">No recipients.</p>}
                />
              ) : (
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
                        {r.error && <span className="ml-2 text-xs text-tone-clay-ink">{r.error}</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{r.sentAt ? formatDate(r.sentAt) : "—"}</td>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
