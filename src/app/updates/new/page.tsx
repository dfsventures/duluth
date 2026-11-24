"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FileText, Upload, X, AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { RichEditor } from "@/components/ui/rich-editor";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";
import { ComposerTitleField } from "@/components/composer/composer-title-field";
import { ComposerDisclosure } from "@/components/composer/composer-disclosure";
import { useCompany } from "@/context/company-context";
import { ORG_NAME } from "@/lib/org";
import { toast } from "@/lib/toast";
import { useFlashMessage } from "@/lib/use-flash-message";
import { PageSkeleton } from "@/components/ui/skeleton";
import { EDITOR_COLUMN } from "@/lib/editor-styles";
import { uploadDocument } from "@/lib/upload-document";
import { formatFileSize } from "@/lib/utils";
import {
  ATTACH_ACCEPT,
  attachmentProblem,
  toPendingAttachments,
  uploadable,
  uploadAttachments,
  type PendingAttachment,
} from "@/lib/update-attachments";

// An attachment row's icon button: 32px, 44px on phones.
const ATTACH_ICON_BTN =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 max-md:h-11 max-md:w-11 v2:rounded-ctl v2:hover:bg-row-hover";

interface MetricDefinition {
  id: string;
  name: string;
  unit: string | null;
}

interface UpdateTemplate {
  id: string;
  name: string;
  description: string | null;
  body: string;
}

export default function NewUpdatePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [templates, setTemplates] = useState<UpdateTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [, setMessage] = useFlashMessage();

  // Form state
  const [period, setPeriod] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [metricInputs, setMetricInputs] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // Set when the update was saved but one or more files failed to upload: the composer stays put
  // (so nothing is lost) with Retry, and Save/Publish are off so a second update isn't created.
  const [savedUpdateId, setSavedUpdateId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (companyLoading) return;

    async function load() {
      try {
        if (!selectedCompany) {
          setLoading(false);
          return;
        }

        const cId = selectedCompany.id;
        setCompanyId(cId);

        // Fetch metric definitions
        const metricsRes = await fetch(`/api/companies/${cId}/metrics`);
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json();
          setMetrics(metricsData.data ?? metricsData ?? []);
        }

        // Fetch available update templates (optional — page works fine with none)
        const templatesRes = await fetch(`/api/templates`);
        if (templatesRes.ok) {
          const templatesData = await templatesRes.json();
          setTemplates(templatesData.data ?? templatesData ?? []);
        }
      } catch {
        setMessage({ type: "error", text: "Failed to load data." });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [companyLoading, selectedCompany?.id, setMessage]);

  function updateMetricInput(metricId: string, value: string) {
    setMetricInputs((prev) => ({ ...prev, [metricId]: value }));
  }

  function applyTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    // Reversible, so no blocking dialog (spec 6.5): apply, then offer Undo.
    const previousBody = body;
    const isBodyEmpty = previousBody.replace(/<[^>]*>/g, "").trim() === "";

    setBody(template.body);
    if (!isBodyEmpty) {
      toast.undo("Replaced your draft with the template.", () => setBody(previousBody));
    }
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    // Copy the files now: the FileList is live, and clearing the input below empties it before
    // React runs the state updater.
    const picked = toPendingAttachments(Array.from(list));
    setAttachments((prev) => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function patchAttachment(key: string, patch: Partial<PendingAttachment>) {
    setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  function removeAttachment(key: string) {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }

  /** Upload rows to the saved update; true when every one landed. */
  async function uploadToUpdate(updateId: string, items: PendingAttachment[]): Promise<boolean> {
    if (!companyId || items.length === 0) return true;
    const failed = await uploadAttachments(
      items,
      (file) => uploadDocument({ companyId, file, updateId }),
      patchAttachment
    );
    return failed === 0;
  }

  async function retryUploads(items: PendingAttachment[]) {
    if (!savedUpdateId) return;
    setRetrying(true);
    try {
      const ok = await uploadToUpdate(savedUpdateId, items);
      const stillFailed = uploadable(attachments).some((a) => !items.some((i) => i.key === a.key));
      if (ok && !stillFailed) {
        setMessage({ type: "success", text: "Files attached." });
        router.push(`/updates/${savedUpdateId}`);
      }
    } finally {
      setRetrying(false);
    }
  }

  async function handleSubmit(status: "DRAFT" | "SENT", scheduledForISO?: string) {
    if (!companyId || savedUpdateId) return;

    if (!period.trim() || !title.trim()) {
      setMessage({ type: "error", text: "Period and title are required." });
      return;
    }

    if (attachments.some((a) => attachmentProblem(a.file) !== null)) {
      setMessage({ type: "error", text: "Remove the files that can't be attached, then try again." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      // Build metric values array
      const metrics = Object.entries(metricInputs)
        .filter(([, val]) => val.trim() !== "")
        .map(([metricDefinitionId, value]) => ({
          metricDefinitionId,
          value: parseFloat(value),
          date: new Date().toISOString(),
        }));

      const res = await fetch(`/api/companies/${companyId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: period.trim(),
          title: title.trim(),
          body: body.trim(),
          status,
          metrics,
          ...(scheduledForISO ? { scheduledFor: scheduledForISO } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to create update");
      }

      const result = await res.json();
      const newUpdate = result.data ?? result;

      // B-233: the update exists now, so its files can be linked to it.
      const toUpload = uploadable(attachments);
      if (newUpdate?.id && toUpload.length > 0) {
        const allUploaded = await uploadToUpdate(newUpdate.id, toUpload);
        if (!allUploaded) {
          setSavedUpdateId(newUpdate.id);
          setConfirmPublish(false);
          setShowSchedule(false);
          setMessage({
            type: "error",
            text:
              status === "SENT"
                ? "Update published, but some files didn't upload. Retry them below."
                : "Update saved, but some files didn't upload. Retry them below.",
          });
          return;
        }
      }

      setMessage({
        type: "success",
        text:
          status === "SENT"
            ? `Update published. The ${ORG_NAME} team has been notified.`
            : scheduledForISO
              ? `Draft scheduled to publish on ${new Date(scheduledForISO).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}.`
              : "Update saved as draft.",
      });
      setConfirmPublish(false);
      setShowSchedule(false);
      setScheduleDate("");

      // Reset form
      setPeriod("");
      setTitle("");
      setBody("");
      setMetricInputs({});
      setAttachments([]);

      // Redirect to the new update (fall back to the list page)
      router.push(newUpdate?.id ? `/updates/${newUpdate.id}` : "/updates");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create update.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!companyId) {
    return (
      <AppShell>
        <PageHeader title="New Update" />
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No company found"
          description="Please complete the setup wizard first."
        />
      </AppShell>
    );
  }

  const isBodyEmpty = body.replace(/<[^>]*>/g, "").trim() === "";
  const canPublish = period.trim() !== "" && title.trim() !== "";
  const isSaved = savedUpdateId !== null;
  const retryable = uploadable(attachments).filter((a) => a.status === "failed");

  return (
    // Page types v1, editor: the 720 column, with the back link in the editor bar.
    <AppShell width="narrow">
      <ComposerTopBar
        back={{ href: "/updates", label: "Updates" }}
        draftLabel="Draft"
        secondaryActions={
          <Button variant="secondary" size="sm" disabled={submitting || isSaved} onClick={() => handleSubmit("DRAFT")}>
            {submitting ? "Saving..." : "Save as Draft"}
          </Button>
        }
        // Phone (§6): Save as Draft folds into ⋯.
        phoneMenuItems={[{ label: submitting ? "Saving..." : "Save as Draft", onClick: () => handleSubmit("DRAFT"), disabled: submitting || isSaved }]}
        publishLabel="Publish"
        onPublishClick={() => setConfirmPublish(true)}
        publishDisabled={!canPublish || isSaved}
        publishing={submitting && confirmPublish}
        overflowItems={[{ label: showSchedule ? "Hide schedule" : "Schedule for later", onClick: () => setShowSchedule((v) => !v) }]}
      />


      {/* Publish confirm — slim banner under the top bar */}
      {confirmPublish && (
        <div className="mb-6 flex flex-wrap items-center justify-end gap-3 rounded-md bg-tone-amber px-4 py-3">
          <span className="text-sm text-foreground">Publish and notify the {ORG_NAME} team?</span>
          <Button variant="secondary" size="sm" disabled={submitting} onClick={() => setConfirmPublish(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={submitting} onClick={() => handleSubmit("SENT")}>
            {submitting ? "Publishing..." : "Confirm Publish"}
          </Button>
        </div>
      )}

      {/* B-233: saved, but some files didn't upload — retry here or go on without them */}
      {isSaved && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md bg-tone-clay px-4 py-3 text-sm text-tone-clay-ink" role="status">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Your update is saved.{" "}
            {retryable.length > 0
              ? `${retryable.length} ${retryable.length === 1 ? "file" : "files"} didn't upload.`
              : "Some files didn't upload."}
          </span>
          {retryable.length > 0 && (
            <Button variant="secondary" size="sm" disabled={retrying} onClick={() => retryUploads(retryable)} className="max-md:min-h-11">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {retrying ? "Retrying..." : "Retry"}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={retrying}
            onClick={() => router.push(`/updates/${savedUpdateId}`)}
            className="max-md:min-h-11"
          >
            Go to update
          </Button>
        </div>
      )}

      {/* Schedule for later — slim panel under the top bar, opened from the overflow menu */}
      {showSchedule && !confirmPublish && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-edge bg-card px-4 py-3 shadow-soft v2:border-0 v2:shadow-none">
          <Input
            id="schedule-date"
            label="Publish date"
            type="date"
            min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!scheduleDate || submitting}
            onClick={() =>
              handleSubmit("DRAFT", new Date(`${scheduleDate}T00:00:00Z`).toISOString())
            }
          >
            {submitting ? "Scheduling..." : "Schedule"}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Publishes on the morning of the selected date (UTC). You can keep editing until then.
          </p>
        </div>
      )}

      <div className={`mx-auto max-w-3xl ${EDITOR_COLUMN}`}>
        <ComposerTitleField title={title} onTitleChange={setTitle} period={period} onPeriodChange={setPeriod} />

        {templates.length > 0 && isBodyEmpty && (
          <div className="mb-4">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) applyTemplate(e.target.value);
                e.target.value = "";
              }}
              aria-label="Start from a template"
              className="w-auto max-w-xs border-0 bg-transparent p-0 text-sm text-muted-foreground focus:outline-none focus:ring-0 v2:rounded-sm v2:text-row v2:focus-visible:ring-2 v2:focus-visible:ring-ring max-md:v2:min-h-11"
            >
              <option value="">Start from a template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.description ? ` — ${t.description}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <RichEditor
          variant="chromeless"
          value={body}
          onChange={setBody}
          placeholder="Tell your investors what happened…"
          companyId={companyId ?? undefined}
        />

        <ComposerDisclosure
          label={
            attachments.length > 0
              ? `Details — metrics & attachments · ${attachments.length} ${attachments.length === 1 ? "file" : "files"}`
              : "Details — metrics & attachments"
          }
        >
          <div className="space-y-6">
            {metrics.length > 0 && (
              <div>
                <p className="mb-3 text-sm font-medium">Metric Values for This Period</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {metrics.map((metric) => (
                    <Input
                      key={metric.id}
                      id={`metric-${metric.id}`}
                      label={`${metric.name}${metric.unit ? ` (${metric.unit})` : ""}`}
                      type="number"
                      step="any"
                      value={metricInputs[metric.id] ?? ""}
                      onChange={(e) => updateMetricInput(metric.id, e.target.value)}
                      placeholder="Enter value"
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">Attachments</p>
              <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-dashed border-muted-foreground/25 p-4 v2:rounded-ctl v2:border v2:border-[color:var(--color-ctl)]">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={submitting || isSaved}
                  onClick={() => fileInputRef.current?.click()}
                  className="max-md:min-h-11"
                >
                  Attach files
                </Button>
                <span className="text-xs text-muted-foreground v2:text-meta">
                  PDF, Office documents, images, CSV, TXT, ZIP, MP4/MOV video. They upload when you save or publish.
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ATTACH_ACCEPT}
                  aria-label="Attach files"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>

              {attachments.length > 0 && (
                <ul className="mt-3 divide-y rounded-md border v2:rounded-none v2:border-x-0 v2:border-y v2:border-row-divider v2:divide-row-divider" aria-label="Attached files">
                  {attachments.map((a) => {
                    const badType = attachmentProblem(a.file) !== null;
                    return (
                      <li
                        key={a.key}
                        className="flex items-center gap-3 px-3 py-2 text-sm max-md:min-h-11 v2:min-h-11 v2:px-0 v2:py-1 v2:text-row"
                      >
                        {a.status === "uploading" ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                        ) : a.status === "done" ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        ) : a.status === "failed" ? (
                          <AlertCircle className="h-4 w-4 shrink-0 text-tone-clay-ink" aria-hidden />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{a.file.name}</p>
                          <p
                            className={`text-xs v2:text-meta ${a.status === "failed" ? "text-tone-clay-ink" : "text-muted-foreground"}`}
                            role={a.status === "failed" ? "alert" : undefined}
                          >
                            {a.status === "failed"
                              ? a.message
                              : a.status === "uploading"
                                ? "Uploading…"
                                : a.status === "done"
                                  ? "Attached"
                                  : formatFileSize(a.file.size)}
                          </p>
                        </div>
                        {a.status === "failed" && !badType && isSaved && (
                          <button
                            type="button"
                            onClick={() => retryUploads([a])}
                            disabled={retrying}
                            aria-label={`Retry ${a.file.name}`}
                            title="Retry"
                            className={ATTACH_ICON_BTN}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                        {a.status !== "uploading" && a.status !== "done" && (
                          <button
                            type="button"
                            onClick={() => removeAttachment(a.key)}
                            disabled={submitting || retrying}
                            aria-label={`Remove ${a.file.name}`}
                            title="Remove"
                            className={ATTACH_ICON_BTN}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </ComposerDisclosure>
      </div>
    </AppShell>
  );
}
