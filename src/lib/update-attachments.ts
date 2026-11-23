// B-233 — attachments in the founder update composer (src/app/updates/new/page.tsx).
//
// Picked files are held in the composer (with Remove) and uploaded only after the composer's
// existing save has created the update, so each one is linked by updateId through the one
// upload sequence (src/lib/upload-document.ts → /api/documents/upload → PUT → /confirm).
// Uploading on pick would need the update to exist first and a way for founders to delete a
// file, which they deliberately don't have (PATCH /api/documents/[id] is admin-only, Q65).
//
// The type check mirrors the server's exactly (validate.ts: the browser's MIME type, lowercased,
// must be in ALLOWED_UPLOAD_TYPES and the extension must be one of its extensions). The server
// still checks; this only tells the founder before saving. There is no size limit on the
// Documents upload, so none here.

import { ALLOWED_UPLOAD_TYPES } from "@/lib/constants";

export type AttachmentStatus = "queued" | "uploading" | "done" | "failed";

export interface PendingAttachment {
  key: string;
  file: File;
  status: AttachmentStatus;
  message?: string;
}

export const UNSUPPORTED_TYPE_MESSAGE =
  "This file type is not supported. Supported types: PDF, Office documents, images, CSV, TXT, ZIP, MP4/MOV video.";

/** The `accept` list for the file picker: every extension the server allows. */
export const ATTACH_ACCEPT = Array.from(new Set(Object.values(ALLOWED_UPLOAD_TYPES).flat()))
  .map((ext) => `.${ext}`)
  .join(",");

/** null when the server will accept this file; otherwise the reason it won't. */
export function attachmentProblem(file: { name: string; type: string }): string | null {
  if (file.name.length > 255) return "File name is too long.";
  const mimeType = (file.type || "application/octet-stream").toLowerCase();
  const allowed = ALLOWED_UPLOAD_TYPES[mimeType];
  if (!allowed) return UNSUPPORTED_TYPE_MESSAGE;
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!allowed.includes(ext)) return `File extension ".${ext}" does not match the file type.`;
  return null;
}

let seq = 0;

/** Turn picked files into list rows: allowed ones queued, the rest shown as failed with the reason. */
export function toPendingAttachments(files: File[]): PendingAttachment[] {
  return files.map((file) => {
    const problem = attachmentProblem(file);
    seq += 1;
    return {
      key: `${file.name}-${file.size}-${seq}`,
      file,
      status: problem ? "failed" : "queued",
      ...(problem ? { message: problem } : {}),
    };
  });
}

/** Files that will be uploaded on save (queued, or failed on upload and so retryable). */
export function uploadable(items: PendingAttachment[]): PendingAttachment[] {
  return items.filter((a) => a.status === "queued" || (a.status === "failed" && attachmentProblem(a.file) === null));
}

/**
 * Upload the given rows one at a time, reporting each state change. Resolves with the number
 * that failed. `upload` is uploadDocument bound to the company and the saved update's id.
 */
export async function uploadAttachments(
  items: PendingAttachment[],
  upload: (file: File) => Promise<unknown>,
  onChange: (key: string, patch: Partial<PendingAttachment>) => void
): Promise<number> {
  let failed = 0;
  for (const item of items) {
    onChange(item.key, { status: "uploading", message: undefined });
    try {
      await upload(item.file);
      onChange(item.key, { status: "done", message: undefined });
    } catch (err) {
      failed += 1;
      onChange(item.key, { status: "failed", message: err instanceof Error ? err.message : "Upload failed." });
    }
  }
  return failed;
}
