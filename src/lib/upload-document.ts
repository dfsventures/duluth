// Part 35, JC-UP-A — the single client-side upload sequence: init -> PUT ->
// confirm. Replaces the same init->PUT logic that used to be copy-pasted
// across five call sites (src/app/company/documents/page.tsx,
// src/app/diligence/page.tsx, src/app/admin/companies/[id]/page.tsx,
// src/app/setup-wizard/page.tsx, src/components/ui/rich-editor.tsx), each
// with its own slightly different — and, in every case, incomplete — error
// handling. One exported uploadDocument() makes the confirm round-trip
// (WS93/D1=B) unskippable by construction, and maps every failure to
// written copy instead of a raw browser string (D3=B / F87).
//
// Reversal path: this is a pure function with no state and no dependencies
// beyond fetch — inlining it back into any one call site is a copy-paste.

export type UploadStage = "init" | "transfer" | "confirm";

export class UploadError extends Error {
  constructor(message: string, readonly stage: UploadStage) {
    super(message);
  }
}

// Part 35, F87 — a blocked CORS preflight REJECTS fetch with a TypeError; it
// never produces a non-ok Response, so an `if (!res.ok)` guard alone misses
// the exact failure mode of both production incidents, and the raw
// "Failed to fetch" / "Load failed" string is meaningless to a founder.
const TRANSFER_FAILED_MESSAGE =
  "This file was not saved — it didn't reach our storage. Please check your connection and try again.";

export interface UploadedDocument {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  docType: string | null;
  isInternal: boolean;
  createdAt: string;
  [key: string]: unknown;
}

export interface UploadDocumentOptions {
  companyId: string;
  file: File;
  docType?: string | null;
  isInternal?: boolean;
  updateId?: string | null;
}

/**
 * D2/WS95.1 — fire-and-forget audit beacon. Never awaited in a way that can
 * fail the caller: under D1 = B, this is the only durable trace anywhere
 * that an upload was attempted and failed, so it must never itself become a
 * reason the founder-facing failure is swallowed.
 */
function reportUploadFailure(opts: UploadDocumentOptions, stage: UploadStage, detail: string) {
  try {
    fetch("/api/documents/upload-failed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: opts.companyId, name: opts.file.name, stage, detail }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let the beacon itself throw.
  }
}

/** The only way to upload a document from the client. */
export async function uploadDocument(opts: UploadDocumentOptions): Promise<UploadedDocument> {
  const mimeType = opts.file.type || "application/octet-stream";
  const fields = {
    companyId: opts.companyId,
    name: opts.file.name,
    mimeType,
    docType: opts.docType ?? null,
    isInternal: opts.isInternal ?? false,
    updateId: opts.updateId ?? null,
  };

  let initRes: Response;
  try {
    initRes = await fetch("/api/documents/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  } catch {
    reportUploadFailure(opts, "init", "network error contacting /api/documents/upload");
    throw new UploadError("Failed to start the upload. Please check your connection and try again.", "init");
  }
  if (!initRes.ok) {
    const errData = await initRes.json().catch(() => null);
    const message = errData?.error ?? "Failed to start the upload.";
    reportUploadFailure(opts, "init", message);
    throw new UploadError(message, "init");
  }
  const { uploadUrl, s3Key } = await initRes.json();

  let putRes: Response;
  try {
    putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: opts.file,
    });
  } catch (err) {
    reportUploadFailure(opts, "transfer", err instanceof Error ? err.message : "network error");
    throw new UploadError(TRANSFER_FAILED_MESSAGE, "transfer");
  }
  if (!putRes.ok) {
    reportUploadFailure(opts, "transfer", `storage responded ${putRes.status}`);
    throw new UploadError(TRANSFER_FAILED_MESSAGE, "transfer");
  }

  let confirmRes: Response;
  try {
    confirmRes = await fetch("/api/documents/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, s3Key }),
    });
  } catch {
    reportUploadFailure(opts, "confirm", "network error contacting /api/documents/confirm");
    throw new UploadError(TRANSFER_FAILED_MESSAGE, "confirm");
  }
  if (!confirmRes.ok) {
    const errData = await confirmRes.json().catch(() => null);
    const message = errData?.error ?? TRANSFER_FAILED_MESSAGE;
    reportUploadFailure(opts, "confirm", message);
    throw new UploadError(message, "confirm");
  }
  const { document } = await confirmRes.json();
  return document as UploadedDocument;
}
