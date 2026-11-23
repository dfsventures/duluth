import { describe, it, expect, vi } from "vitest";
import { validateUploadFields } from "@/app/api/documents/upload/validate";
import {
  ATTACH_ACCEPT,
  attachmentProblem,
  toPendingAttachments,
  uploadable,
  uploadAttachments,
  type PendingAttachment,
} from "@/lib/update-attachments";

function file(name: string, type: string, body = "x"): File {
  return new File([body], name, { type });
}

describe("attachmentProblem — mirrors the server's upload check", () => {
  const cases: Array<[string, string]> = [
    ["deck.pdf", "application/pdf"],
    ["figures.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["photo.JPG", "image/jpeg"],
    ["notes.txt", "text/plain"],
    ["demo.mov", "video/quicktime"],
    ["logo.svg", "image/svg+xml"], // excluded on purpose (XSS)
    ["deck.pdf", "image/png"], // extension does not match type
    ["noext", "application/pdf"],
    ["mystery.bin", ""], // browser gave no type
  ];

  it.each(cases)("%s (%s) agrees with validateUploadFields", (name, type) => {
    const client = attachmentProblem({ name, type });
    const server = validateUploadFields({
      companyId: "c1",
      name,
      mimeType: type || "application/octet-stream", // what uploadDocument sends
    });
    expect(client === null).toBe(server.ok);
  });

  it("accepts a normal PDF and rejects SVG with the supported-types message", () => {
    expect(attachmentProblem({ name: "deck.pdf", type: "application/pdf" })).toBeNull();
    expect(attachmentProblem({ name: "logo.svg", type: "image/svg+xml" })).toMatch(/not supported/);
  });

  it("names the mismatched extension", () => {
    expect(attachmentProblem({ name: "deck.pdf", type: "image/png" })).toBe(
      'File extension ".pdf" does not match the file type.'
    );
  });

  it("rejects names over 255 characters", () => {
    expect(attachmentProblem({ name: `${"a".repeat(252)}.pdf`, type: "application/pdf" })).toBe(
      "File name is too long."
    );
  });
});

describe("ATTACH_ACCEPT", () => {
  it("lists the allowed extensions and not svg", () => {
    const list = ATTACH_ACCEPT.split(",");
    expect(list).toContain(".pdf");
    expect(list).toContain(".pptx");
    expect(list).toContain(".mp4");
    expect(list).not.toContain(".svg");
    expect(new Set(list).size).toBe(list.length);
  });
});

describe("toPendingAttachments / uploadable", () => {
  it("queues allowed files and marks the rest failed with the reason", () => {
    const rows = toPendingAttachments([file("a.pdf", "application/pdf"), file("b.svg", "image/svg+xml")]);
    expect(rows.map((r) => r.status)).toEqual(["queued", "failed"]);
    expect(rows[1].message).toMatch(/not supported/);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });

  it("gives the same file picked twice two rows", () => {
    const f = file("a.pdf", "application/pdf");
    const rows = [...toPendingAttachments([f]), ...toPendingAttachments([f])];
    expect(rows[0].key).not.toBe(rows[1].key);
  });

  it("uploads queued rows and retries upload failures, never bad types or finished ones", () => {
    const [ok, bad] = toPendingAttachments([file("a.pdf", "application/pdf"), file("b.svg", "image/svg+xml")]);
    const rows: PendingAttachment[] = [
      ok,
      bad,
      { ...ok, key: "k2", status: "failed", message: "network" },
      { ...ok, key: "k3", status: "done" },
    ];
    expect(uploadable(rows).map((r) => r.key)).toEqual([ok.key, "k2"]);
  });
});

describe("uploadAttachments", () => {
  it("uploads in order, reports each state, and counts failures", async () => {
    const rows = toPendingAttachments([
      file("a.pdf", "application/pdf"),
      file("b.pdf", "application/pdf"),
      file("c.pdf", "application/pdf"),
    ]);
    const order: string[] = [];
    const upload = vi.fn(async (f: File) => {
      order.push(f.name);
      if (f.name === "b.pdf") throw new Error("This file was not saved");
    });
    const changes: Array<[string, Partial<PendingAttachment>]> = [];
    const failed = await uploadAttachments(rows, upload, (key, patch) => changes.push([key, patch]));

    expect(failed).toBe(1);
    expect(order).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
    const final = new Map<string, Partial<PendingAttachment>>();
    for (const [key, patch] of changes) final.set(key, { ...final.get(key), ...patch });
    expect(final.get(rows[0].key)?.status).toBe("done");
    expect(final.get(rows[1].key)).toMatchObject({ status: "failed", message: "This file was not saved" });
    expect(final.get(rows[2].key)?.status).toBe("done");
    // Each row goes through uploading first.
    expect(changes.filter(([, p]) => p.status === "uploading")).toHaveLength(3);
  });

  it("returns 0 for nothing to upload", async () => {
    const upload = vi.fn();
    expect(await uploadAttachments([], upload, () => {})).toBe(0);
    expect(upload).not.toHaveBeenCalled();
  });
});
