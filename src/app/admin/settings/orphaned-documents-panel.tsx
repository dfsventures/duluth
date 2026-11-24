"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";

interface OrphanedDoc {
  id: string;
  name: string;
  createdAt: string;
  company: { name: string };
  uploadedBy: { email: string };
}

export function OrphanedDocumentsPanel() {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<number | null>(null);
  const [orphaned, setOrphaned] = useState<OrphanedDoc[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/documents/orphan-scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed.");
      setScanned(data.scanned);
      setOrphaned(data.orphaned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  const confirm = useConfirm();
  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Permanently delete this document row", description: "This cannot be undone.", confirmLabel: "Delete row" }))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/documents/${id}/orphan`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed.");
      setOrphaned((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={handleScan} disabled={scanning}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {scanning ? "Scanning..." : "Scan for orphaned documents"}
        </Button>
        {scanned !== null && (
          <span className="text-xs text-muted-foreground">
            {scanned} document{scanned === 1 ? "" : "s"} checked, {orphaned.length} orphaned
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-tone-clay-ink">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
      {orphaned.length > 0 && (
        <div className="mt-4">
          <DataTable<OrphanedDoc>
            label="Orphaned documents"
            noun="document"
            rows={orphaned}
            rowKey={(d) => d.id}
            defaultSort={{ key: "created", dir: "desc" }}
            urlState={false}
            minWidth={640}
            actionsLabel="Row actions"
            actionsAlwaysVisible
            empty={null}
            columns={[
              { key: "name", header: "Name", sortValue: (d) => d.name, cell: (d) => <span className="min-w-0 truncate">{d.name}</span> },
              { key: "company", header: "Company", mobile: "meta", sortValue: (d) => d.company.name, cell: (d) => d.company.name },
              { key: "by", header: "Uploaded by", dropBelow: 480, sortValue: (d) => d.uploadedBy.email, cell: (d) => d.uploadedBy.email },
              {
                key: "created",
                header: "Created",
                align: "num",
                firstDir: "desc",
                mobile: "meta",
                sortValue: (d) => new Date(d.createdAt).getTime(),
                cell: (d) => formatDate(d.createdAt),
              },
            ]}
            rowActions={(doc) => (
              <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.id)} disabled={deletingId === doc.id}>
                <Trash2 className="h-3.5 w-3.5" />
                {deletingId === doc.id ? "Deleting..." : "Delete"}
                <span className="sr-only"> {doc.name}</span>
              </Button>
            )}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Checks every document&apos;s file against storage and lists any row whose file is missing (most often caused by
        an interrupted upload — a dropped connection, an expired link, or a storage outage). Nothing is deleted
        automatically; review each row before removing it.
      </p>
    </>
  );
}
