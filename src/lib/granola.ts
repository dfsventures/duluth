// Part 37 (WS109.1) — Granola public API client. Server only.
// Endpoints/shape verified against docs.granola.ai (List Notes, Get Note) on 2026-10-09.
// Nothing here ever logs note titles or content.

export function granolaIntakeEnabled(): boolean {
  return Boolean(process.env.GRANOLA_API_KEY && process.env.GRANOLA_FOLDER_ID);
}
export function granolaWebhookEnabled(): boolean {
  return granolaIntakeEnabled() && Boolean(process.env.GRANOLA_WEBHOOK_SECRET);
}

const BASE = "https://public-api.granola.ai/v1";
export const NOTE_ID_RE = /^not_[a-zA-Z0-9]{14}$/;
export const FOLDER_ID_RE = /^fol_[a-zA-Z0-9]{14}$/;

/** Message is ours (status + generic text), never response content. */
export class GranolaApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "GranolaApiError";
  }
}

export interface GranolaFolderRef {
  id: string;
  name?: string;
  parent_folder_id: string | null;
}

export interface GranolaNote {
  id: string;
  title: string | null;
  owner: { name: string | null; email: string };
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  web_url?: string;
  calendar_event: { scheduled_start_time: string | null; event_title?: string | null } | null;
  attendees: { name: string | null; email: string }[];
  folder_membership: GranolaFolderRef[];
  summary_text: string | null;
  summary_markdown: string | null;
}

export interface GranolaNoteSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

async function granolaFetch(path: string): Promise<Response> {
  const key = process.env.GRANOLA_API_KEY;
  if (!key) throw new GranolaApiError("GRANOLA_API_KEY is not set");
  const doFetch = () =>
    fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  let res = await doFetch(); // limit is a 25 burst / 5 rps
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await doFetch();
  }
  return res;
}

function failFor(status: number): GranolaApiError {
  if (status === 401) return new GranolaApiError("Granola rejected the API key (401)", 401);
  if (status === 429) return new GranolaApiError("Granola rate limit (429)", 429);
  return new GranolaApiError(`Granola API error (${status})`, status);
}

/** 404 -> null (note gone, or not visible to this key). */
export async function getGranolaNote(noteId: string): Promise<GranolaNote | null> {
  if (!NOTE_ID_RE.test(noteId)) throw new GranolaApiError("Invalid Granola note id");
  const res = await granolaFetch(`/notes/${noteId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw failFor(res.status);
  const n = (await res.json()) as Partial<GranolaNote>;
  return {
    id: String(n.id ?? noteId),
    title: n.title ?? null,
    owner: n.owner ?? { name: null, email: "" },
    created_at: String(n.created_at),
    updated_at: String(n.updated_at),
    deleted_at: n.deleted_at ?? null,
    web_url: n.web_url,
    calendar_event: n.calendar_event ?? null,
    attendees: Array.isArray(n.attendees) ? n.attendees : [],
    folder_membership: Array.isArray(n.folder_membership) ? n.folder_membership : [],
    summary_text: n.summary_text ?? null,
    summary_markdown: n.summary_markdown ?? null,
  };
}

/** Notes in GRANOLA_FOLDER_ID (the API includes child folders) updated after a date. Newest first, as returned. */
export async function listFolderNotes(opts: {
  updatedAfter: Date;
  maxPages?: number;
}): Promise<GranolaNoteSummary[]> {
  const folderId = process.env.GRANOLA_FOLDER_ID ?? "";
  if (!FOLDER_ID_RE.test(folderId)) throw new GranolaApiError("GRANOLA_FOLDER_ID is not a valid folder id (fol_…)");
  const out: GranolaNoteSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < (opts.maxPages ?? 3); page++) {
    const qs = new URLSearchParams({
      folder_id: folderId,
      updated_after: opts.updatedAfter.toISOString(),
      page_size: "30",
    });
    if (cursor) qs.set("cursor", cursor);
    const res = await granolaFetch(`/notes?${qs.toString()}`);
    if (!res.ok) throw failFor(res.status);
    const body = (await res.json()) as {
      notes?: GranolaNoteSummary[];
      hasMore?: boolean;
      cursor?: string | null;
    };
    for (const n of body.notes ?? []) {
      if (n && NOTE_ID_RE.test(n.id) && !n.deleted_at) out.push(n);
    }
    if (!body.hasMore || !body.cursor) break;
    cursor = body.cursor;
  }
  return out;
}

/** Confidentiality guard (Q93): direct membership, or a folder whose parent is the configured folder. */
export function noteInFolder(note: Pick<GranolaNote, "folder_membership">, folderId: string): boolean {
  return (note.folder_membership ?? []).some((f) => f.id === folderId || f.parent_folder_id === folderId);
}
