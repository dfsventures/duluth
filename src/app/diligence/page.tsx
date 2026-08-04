"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { useCompany } from "@/context/company-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DD_DOC_TYPES, AUTO_INTERNAL_DOC_TYPES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

// Part 16, WS40 — founder-facing DD checklist. Purpose-built (not a
// /setup-wizard extension, per F31 — that step's file input has no
// onChange handler wired up). Reuses the existing presigned-upload
// machinery (POST /api/documents/upload -> S3 PUT) already used by the
// admin company page. Non-blocking (Q55): reachable only from the
// sidebar/dashboard banner while stage === "DILIGENCE", never a gate.

interface Diligence {
  isUsIncorporated: boolean | null;
  isStellarEcosystem: boolean;
  stellarWhyText: string | null;
  stellarTimelineText: string | null;
  completedAt: string | null;
  stage: string;
  progress: { done: number; total: number };
  // Part 16, WS42 — name+date only, no download link. Sourced from this
  // route rather than GET /api/companies/[id]/documents, which (as of
  // WS42) filters isInternal docs out for every non-admin including the
  // founder who uploaded them — passport/bank_statements are always
  // isInternal, so this page can't rely on that list for its own upload
  // status without losing visibility into the founder's own uploads.
  documents: Record<string, { name: string; createdAt: string } | null>;
}

export default function DiligencePage() {
  const router = useRouter();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const companyId = selectedCompany?.id;

  const [diligence, setDiligence] = useState<Diligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isUsIncorporated, setIsUsIncorporated] = useState<boolean | null>(null);
  const [stellarWhyText, setStellarWhyText] = useState("");
  const [stellarTimelineText, setStellarTimelineText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadDiligence = useCallback(async (id: string) => {
    const res = await fetch(`/api/companies/${id}/diligence`);
    if (!res.ok) throw new Error("Failed to load diligence checklist");
    const data: Diligence = await res.json();
    setDiligence(data);
    setIsUsIncorporated(data.isUsIncorporated);
    setStellarWhyText(data.stellarWhyText ?? "");
    setStellarTimelineText(data.stellarTimelineText ?? "");
  }, []);

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setLoading(false);
      return;
    }

    async function fetchAll(id: string) {
      try {
        await loadDiligence(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    fetchAll(companyId);
  }, [companyId, companyLoading, loadDiligence]);

  // Already promoted (or reached directly by URL) — nothing to do here.
  useEffect(() => {
    if (diligence && diligence.stage !== "DILIGENCE") {
      router.replace("/dashboard");
    }
  }, [diligence, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;

    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {};
      if (isUsIncorporated !== null) body.isUsIncorporated = isUsIncorporated;
      if (diligence?.isStellarEcosystem) {
        body.stellarWhyText = stellarWhyText;
        body.stellarTimelineText = stellarTimelineText;
      }

      const res = await fetch(`/api/companies/${companyId}/diligence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to save");
      }
      const data: Diligence = await res.json();
      setDiligence(data);
      setMessage({ type: "success", text: "Saved." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(docType: string, file: File) {
    if (!companyId) return;
    setUploadingType(docType);
    setMessage(null);
    try {
      const initRes = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          docType,
          isInternal: AUTO_INTERNAL_DOC_TYPES.has(docType),
        }),
      });
      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to initiate upload");
      }
      const { uploadUrl } = await initRes.json();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      await loadDiligence(companyId);
      setMessage({ type: "success", text: `"${file.name}" uploaded successfully.` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploadingType(null);
      const input = fileInputRefs.current[docType];
      if (input) input.value = "";
    }
  }

  if (companyLoading || loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </AppShell>
    );
  }

  if (!companyId || !diligence) {
    return (
      <AppShell>
        <PageHeader title="Due Diligence" description="Nothing to review right now." />
      </AppShell>
    );
  }

  if (diligence.stage !== "DILIGENCE") {
    return null;
  }

  return (
    <AppShell>
      <PageHeader
        title="Due Diligence"
        description="A few documents and quick questions before we close — everything else in Molly is already yours to use."
      />

      <div className="mb-6 flex items-center gap-2 text-sm">
        {diligence.completedAt ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-acacia" />
            <span className="text-acacia">All done! We are reviewing your documents and will be in touch soon.</span>
          </>
        ) : (
          <>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {diligence.progress.done} of {diligence.progress.total} required items done
            </span>
          </>
        )}
      </div>

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-acacia/30 bg-acacia/10 text-acacia"
              : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Incorporation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">Is the company incorporated in the US?</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="isUsIncorporated"
                  checked={isUsIncorporated === true}
                  onChange={() => setIsUsIncorporated(true)}
                />
                Yes
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="isUsIncorporated"
                  checked={isUsIncorporated === false}
                  onChange={() => setIsUsIncorporated(false)}
                />
                No
              </label>
            </div>
          </CardContent>
        </Card>

        {diligence.isStellarEcosystem && (
          <Card>
            <CardHeader>
              <CardTitle>Stellar Ecosystem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                id="stellarWhyText"
                label="Why does this deal involve the Stellar ecosystem?"
                value={stellarWhyText}
                onChange={(e) => setStellarWhyText(e.target.value)}
                rows={4}
              />
              <Textarea
                id="stellarTimelineText"
                label="What's the timeline for Stellar involvement?"
                value={stellarTimelineText}
                onChange={(e) => setStellarTimelineText(e.target.value)}
                rows={4}
              />
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {DD_DOC_TYPES.map((docType) => {
            const existing = diligence.documents[docType.value] ?? null;
            const uploading = uploadingType === docType.value;
            return (
              <div
                key={docType.value}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-bone pb-4 last:border-0 last:pb-0"
              >
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-medium">
                    {docType.label}
                    {docType.value === "passport" && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">(required)</span>
                    )}
                  </p>
                  {existing ? (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      {existing.name}
                      <span className="text-xs">&middot; {formatDate(existing.createdAt)}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">No file uploaded yet.</p>
                  )}
                </div>
                <div className="shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRefs.current[docType.value]?.click()}
                  >
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    {uploading ? "Uploading..." : existing ? "Replace" : "Upload"}
                  </Button>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[docType.value] = el;
                    }}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(docType.value, file);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </AppShell>
  );
}
