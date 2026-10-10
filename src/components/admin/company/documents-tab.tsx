"use client";

import { useRef, useState } from "react";
import { Archive, ArchiveRestore, Download, Eye, FileText, FolderOpen, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatFileSize } from "@/lib/utils";
import { DOC_TYPES } from "@/lib/constants";
import { isInlineViewable } from "@/lib/documents";
import { uploadDocument } from "@/lib/upload-document";
import type { FlashMessage } from "@/lib/use-flash-message";
import type { Document } from "./types";

export interface DocumentLoadOpts {
  search?: string;
  docType?: string;
  archived?: boolean;
}

export function DocumentsTab({
  companyId,
  documents,
  loadDocuments,
  setMessage,
}: {
  companyId: string;
  documents: Document[];
  loadDocuments: (opts?: DocumentLoadOpts) => Promise<void>;
  setMessage: (m: FlashMessage | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadInternal, setUploadInternal] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>("");
  const [docSearch, setDocSearch] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archivingDocId, setArchivingDocId] = useState<string | null>(null);

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      await uploadDocument({
        companyId,
        file,
        isInternal: uploadInternal,
        docType: uploadDocType || null,
      });

      await loadDocuments({ search: docSearch, docType: docTypeFilter, archived: showArchived });
      setMessage({ type: "success", text: `"${file.name}" uploaded successfully.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Upload failed.",
      });
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
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Download failed.",
      });
    }
  }

  async function handleArchiveDoc(docId: string, archive: boolean) {
    setArchivingDocId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive }),
      });
      if (!res.ok) throw new Error("Failed to update document");
      await loadDocuments({ search: docSearch, docType: docTypeFilter, archived: showArchived });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update document.",
      });
    } finally {
      setArchivingDocId(null);
    }
  }

  return (
    <div>
      {/* Upload controls */}
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
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={uploadInternal}
                onChange={(e) => setUploadInternal(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Internal only
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-3.5 w-3.5" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search documents..."
            value={docSearch}
            onChange={(e) => {
              setDocSearch(e.target.value);
              loadDocuments({ search: e.target.value, docType: docTypeFilter, archived: showArchived });
            }}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <Select
          value={docTypeFilter}
          onChange={(e) => {
            setDocTypeFilter(e.target.value);
            loadDocuments({ search: docSearch, docType: e.target.value, archived: showArchived });
          }}
          className="w-auto"
        >
          <option value="">All types</option>
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              loadDocuments({ search: docSearch, docType: docTypeFilter, archived: e.target.checked });
            }}
            className="h-3.5 w-3.5"
          />
          Show archived
        </label>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-8 w-8" />}
          title="No documents"
          description={showArchived ? "No archived documents." : "No documents have been uploaded for this company."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Uploaded By</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Visibility</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`border-b last:border-0 hover:bg-muted/50 ${doc.archivedAt ? "opacity-60" : ""}`}
                  >
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
                      <Badge variant={doc.isInternal ? "warning" : "neutral"}>
                        {doc.isInternal ? "Internal" : "Shared"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
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
                        <button
                          onClick={() => handleArchiveDoc(doc.id, !doc.archivedAt)}
                          disabled={archivingDocId === doc.id}
                          className="text-muted-foreground hover:text-tone-amber-ink disabled:opacity-40"
                          title={doc.archivedAt ? "Unarchive" : "Archive"}
                        >
                          {doc.archivedAt ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
