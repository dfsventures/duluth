// Part 39 (WS122.1, built with WS121 because board_cards needs it). Name -> id resolution for
// the Marge tools. Never creates anything (JC-MG-J, Q100) and never guesses between two matches
// (F124: resolveEntity, used by Granola and paste, takes the first; this path refuses instead).
import { db } from "@/lib/db";
import { normalizeName, type Canonical } from "@/lib/board-reconcile";
import { ensureAdminPeople, loadBoardContext } from "@/lib/board-server";
import type { Principal } from "@/lib/marge-auth";
import { ToolError } from "@/lib/marge-tools/types";

export type ResolveKind = "person" | "project" | "company";
export type Resolved = { ok: true; id: string; name: string } | { ok: false; error: string };

const PLURAL: Record<ResolveKind, string> = { person: "people", project: "projects", company: "companies" };
const KNOWN_LIMIT = 8;

export function resolveOne(raw: string, list: Canonical[], kind: ResolveKind): Resolved {
  const n = normalizeName(raw);
  if (n) {
    const byName = list.filter((c) => normalizeName(c.name) === n);
    const byAlias = byName.length ? [] : list.filter((c) => c.aliases.includes(n));
    const hit = byName.length ? byName : byAlias;
    if (hit.length === 1) return { ok: true, id: hit[0].id, name: hit[0].name };
    if (hit.length > 1) {
      const full = kind === "person" ? "the full name" : "the exact name";
      return {
        ok: false,
        error: `“${raw}” matches ${hit.length} ${PLURAL[kind]}: ${hit.map((c) => c.name).join(", ")}. Use ${full}.`,
      };
    }
  }
  const known = list.slice(0, KNOWN_LIMIT).map((c) => c.name);
  return {
    ok: false,
    error: `No ${kind} called “${raw}”.${known.length ? ` Known: ${known.join(", ")}${list.length > KNOWN_LIMIT ? ", …" : ""}.` : ""}`,
  };
}

/**
 * "me" -> the principal's BoardPerson. ensureAdminPeople() guarantees every admin has one, but it
 * can upsert, so it only runs when `allowCreate` is true (reads and applies). On a dry run
 * (allowCreate false) a missing person resolves to id "" with the principal's name: the preview
 * still reads right, nothing is written, and the apply re-resolves with creation allowed.
 */
export async function resolveMe(p: Principal, allowCreate = true): Promise<{ id: string; name: string }> {
  if (allowCreate) await ensureAdminPeople();
  const person = await db.boardPerson.findUnique({
    where: { userId: p.id },
    select: { id: true, displayName: true, user: { select: { name: true } } },
  });
  if (!person) {
    if (!allowCreate) return { id: "", name: p.name ?? "you" };
    throw new ToolError("Molly has no board profile for you yet.");
  }
  return { id: person.id, name: person.user?.name ?? person.displayName };
}

export interface BoardLists {
  people: Canonical[];
  projects: Canonical[];
}

export async function loadBoardLists(): Promise<BoardLists> {
  const { people, projects } = await loadBoardContext();
  return { people, projects };
}

/** One person: "me" or a name. Throws ToolError on unknown or ambiguous. */
export async function resolvePerson(
  raw: string,
  p: Principal,
  lists: BoardLists,
  allowCreate = true
): Promise<{ id: string; name: string }> {
  if (normalizeName(raw) === "me") return resolveMe(p, allowCreate);
  const r = resolveOne(raw, lists.people, "person");
  if (!r.ok) throw new ToolError(r.error);
  return { id: r.id, name: r.name };
}

export function resolveProject(raw: string, lists: BoardLists): { id: string; name: string } {
  const r = resolveOne(raw, lists.projects, "project");
  if (!r.ok) throw new ToolError(r.error);
  return { id: r.id, name: r.name };
}
