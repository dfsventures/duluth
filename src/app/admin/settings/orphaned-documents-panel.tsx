"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

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

  async function handleDelete(id: string) {
    if (!window.confirm("Permanently delete this document row? This cannot be undone.")) return;
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
      <div className="flex items-center gap-3">
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
        <p className="mt-2 flex items-center gap-1.5 text-sm text-laterite">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
      {orphaned.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Uploaded by</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {orphaned.map((doc) => (
                <tr key={doc.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{doc.name}</td>
                  <td className="px-3 py-2">{doc.company.name}</td>
                  <td className="px-3 py-2">{doc.uploadedBy.email}</td>
                  <td className="px-3 py-2">{formatDate(doc.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {deletingId === doc.id ? "Deleting..." : "Delete"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
