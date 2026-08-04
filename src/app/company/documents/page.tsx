"use client";
// Part 20, WS47 — general company document library for founders.
// Resolves the gap /diligence left behind once a company is promoted
// out of DILIGENCE (that page returns null for any non-DD company) and
// gives every founder — DD or ACTIVE alike, per JC-FD-B — a real place
// to upload/view/download company documents outside the update composer.
//
// Upload/view/download only (Q65 = A, confirmed) — no archive/delete
// affordance anywhere on this page. PATCH /api/documents/[id] is
// admin-only as of WS46 (F39), so there is no non-admin path to reach
// even if a control existed here.

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, Search, Eye, Download, FolderOpen, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useCompany } from "@/context/company-context";
import { DOC_TYPES, AUTO_INTERNAL_DOC_TYPES } from "@/lib/constants";
import { isInlineViewable } from "@/lib/documents";
import { formatDate, formatFileSize } from "@/lib/utils";

interface Document {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  docType: string | null;
  createdAt: string;
  uploadedBy: string | null;
  isInternal: boolean;
}

export default function CompanyDocumentsPage() {
  const { selectedCompany, loading: companyLoading } = useCompany();
  const companyId = selectedCompany?.id;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDocType, setUploadDocType] = useState("");
  const [docSearch, setDocSearch] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = useCallback(
    async (id: string, opts?: { search?: string; docType?: string }) => {
      const params = new URLSearchParams();
      if (opts?.search) params.set("search", opts.search);
      if (opts?.docType) params.set("docType", opts.docType);
      const res = await fetch(`/api/companies/${id}/documents?${params}`);
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data.data ?? data ?? []);
    },
    []
  );

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setLoading(false);
      return;
    }

    loadDocuments(companyId)
      .catch(() => setMessage({ type: "error", text: "Failed to load documents." }))
      .finally(() => setLoading(false));
  }, [companyId, companyLoading, loadDocuments]);

  async function handleUpload(file: File) {
    if (!companyId) return;
    setUploading(true);
    setMessage(null);
    try {
      const initRes = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          docType: uploadDocType || null,
          isInternal: AUTO_INTERNAL_DOC_TYPES.has(uploadDocType),
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

      await loadDocuments(companyId, { search: docSearch, docType: docTypeFilter });
      setMessage({ type: "success", text: `"${file.name}" uploaded successfully.` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(docId: string, docName: string) {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) throw new Error("Failed to get download link");
      const data = await res.json();
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = docName;
      a.click();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Download failed." });
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

  if (!companyId) {
    return (
      <AppShell>
        <PageHeader title="Documents" description="Nothing to show right now." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Documents"
        description="Files shared with the Molly team — cap tables, financials, legal documents, and more."
      />

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-acacia/30 bg-acacia/10 text-acacia"
              : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}>
            <X className="h-4 w-4 opacity-50 hover:opacity-100" />
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <p className="mb-1 text-sm font-medium">Upload Document</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} className="w-auto">
              <option value="">No type</option>
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
            <Button variant="secondary" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-3.5 w-3.5" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search documents..."
            value={docSearch}
            onChange={(e) => {
              setDocSearch(e.target.value);
              loadDocuments(companyId, { search: e.target.value, docType: docTypeFilter });
            }}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <Select
          value={docTypeFilter}
          onChange={(e) => {
            setDocTypeFilter(e.target.value);
            loadDocuments(companyId, { search: docSearch, docType: e.target.value });
          }}
          className="w-auto"
        >
          <option value="">All types</option>
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-8 w-8" />}
          title="No documents"
          description="No documents have been uploaded for this company yet."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Uploaded By</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {doc.name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {doc.docType ? (
                          <Badge variant="neutral">
                            {DOC_TYPES.find((t) => t.value === doc.docType)?.label ?? doc.docType}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(doc.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {doc.uploadedBy ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatFileSize(doc.size)}
                      </td>
                      <td className="px-4 py-3">
                        {doc.isInternal ? (
                          // Only ever reachable for the founder's OWN internal
                          // upload (the list route only returns another
                          // uploader's isInternal doc to an admin) — same
                          // "received, not re-viewable" treatment /diligence
                          // already uses for these document types.
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Received — an admin can view this; you can re-upload to replace it">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Received
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {isInlineViewable(doc.mimeType) && (
                              <a
                                href={`/api/documents/${doc.id}/view`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary"
                                title="View"
                              >
                                <Eye className="h-4 w-4" />
                              </a>
                            )}
                            <button
                              onClick={() => handleDownload(doc.id, doc.name)}
                              className="text-muted-foreground hover:text-primary"
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
