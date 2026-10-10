"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertCircle, ChevronDown, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BOARD_STATUSES, BOARD_STATUS_LABELS, type BoardStatus } from "@/lib/board";
import { cn } from "@/lib/utils";
import { BoardCard } from "@/components/admin/board/board-card";
import { BoardColumn } from "@/components/admin/board/board-column";
import { CardDialog } from "@/components/admin/board/card-dialog";
import { ResolveDialog } from "@/components/admin/board/resolve-dialog";
import { PeopleProjectsPanel } from "@/components/admin/board/people-projects-panel";
import { IntakePanel } from "@/components/admin/board/intake-panel";
import {
  applyCardToPayload,
  createSequencer,
  isNoopMove,
  neighboursForIndex,
  undoTarget,
} from "@/lib/board-client";
import { toast } from "@/lib/toast";
import { localPosition, type BoardCardData, type BoardPayload } from "@/components/admin/board/types";
import { Skeleton } from "@/components/ui/skeleton";

// Part 37 (WS107). Tabs are data. The Intake tab (WS109) is appended only when
// the server wrapper (page.tsx) says granolaIntakeEnabled().
const TABS = [
  { value: "board", label: "Board" },
  { value: "people", label: "People & projects" },
] as const;

const INTAKE_TAB = { value: "intake", label: "Intake" } as const;

export default function BoardPage({ granolaIntake = false }: { granolaIntake?: boolean }) {
  return (
    <Suspense fallback={null}>
      <BoardPageInner granolaIntake={granolaIntake} />
    </Suspense>
  );
}

// Where a drag would land: the column, and the index among that column's other cards.
type DropTarget = { status: BoardStatus; index: number } | null;

function BoardPageInner({ granolaIntake }: { granolaIntake: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [data, setData] = useState<BoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<string>(() =>
    granolaIntake && searchParams.get("tab") === "intake" ? "intake" : "board"
  );
  const tabs = granolaIntake ? [...TABS, INTAKE_TAB] : TABS;
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<BoardCardData | "new" | null>(null);
  const [resolving, setResolving] = useState<BoardCardData | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  // Card that just landed (Sky wash), a polite announcement for screen readers,
  // and a card to put keyboard focus back on after it re-renders in a new place.
  const [landedId, setLandedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<string | null>(null);
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshot = useRef<BoardPayload | null>(null);
  // Undo and Retry run later, from callbacks created during an earlier render.
  // They read the board through these refs so they never act on a stale copy.
  const dataRef = useRef<BoardPayload | null>(null);
  const columnsRef = useRef<Record<BoardStatus, BoardCardData[]> | null>(null);
  const loadSeq = useRef(createSequencer());

  const projectFilter = searchParams.get("project") ?? "";
  const ownerFilter = searchParams.get("owner") ?? "";
  const reviewOnly = searchParams.get("review") === "1";

  const setFilter = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (value) p.set(key, value);
      else p.delete(key);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Sequence-guarded: only the newest request may write state, so a slow
  // response can never overwrite a newer load or an optimistic move.
  const load = useCallback(async () => {
    const seq = loadSeq.current.next();
    try {
      const res = await fetch("/api/admin/board", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load the board.");
      const json = await res.json();
      if (!loadSeq.current.isCurrent(seq)) return;
      setData(json);
      setLoadError("");
    } catch (e) {
      if (!loadSeq.current.isCurrent(seq)) return;
      setLoadError(e instanceof Error ? e.message : "Failed to load the board.");
    } finally {
      if (loadSeq.current.isCurrent(seq)) setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const myPersonId = useMemo(
    () => data?.people.find((p) => p.userId && p.userId === session?.user?.id)?.id ?? null,
    [data, session]
  );
  const personById = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p])), [data]);
  const personByUserId = useMemo(
    () => new Map((data?.people ?? []).filter((p) => p.userId).map((p) => [p.userId as string, p])),
    [data]
  );
  const projectById = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data]);

  // Full ordered columns (unfiltered): server-side neighbours are computed on these.
  const columns = useMemo(() => {
    const out = {} as Record<BoardStatus, BoardCardData[]>;
    for (const s of BOARD_STATUSES) out[s] = [];
    for (const c of data?.cards ?? []) out[c.status]?.push(c);
    for (const s of BOARD_STATUSES) out[s].sort((a, b) => a.position - b.position);
    return out;
  }, [data]);

  dataRef.current = data;
  columnsRef.current = columns;

  const matches = useCallback(
    (c: BoardCardData) => {
      if (projectFilter === "none" ? c.projectId : projectFilter && c.projectId !== projectFilter) return false;
      if (ownerFilter) {
        if (ownerFilter === "me") {
          if (!myPersonId || c.ownerId !== myPersonId) return false;
        } else if (ownerFilter === "none") {
          if (c.ownerId) return false;
        } else if (c.ownerId !== ownerFilter) return false;
      }
      if (reviewOnly && !c.needsReview) return false;
      if (search.trim() && !c.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    },
    [projectFilter, ownerFilter, reviewOnly, search, myPersonId]
  );
  const visible = useMemo(() => {
    const out = {} as Record<BoardStatus, BoardCardData[]>;
    for (const s of BOARD_STATUSES) out[s] = columns[s].filter(matches);
    return out;
  }, [columns, matches]);

  function flashLanded(id: string) {
    setLandedId(id);
    if (landedTimer.current) clearTimeout(landedTimer.current);
    landedTimer.current = setTimeout(() => setLandedId(null), 1500);
  }

  // After a keyboard move the card may have re-mounted in another column;
  // give focus back to its title so the user can keep going.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    (document.querySelector(`[data-card-id="${id}"] [data-card-title]`) as HTMLElement | null)?.focus();
  }, [data]);

  /**
   * Optimistic move (spec 6.5: reversible, so act now and offer Undo). The
   * contract is unchanged: beforeId = the card directly above, afterId = the
   * card directly below, neither = the end of the column.
   */
  async function move(
    cardId: string,
    status: BoardStatus,
    beforeId?: string,
    afterId?: string,
    opts: { undo?: boolean; refocus?: boolean } = {}
  ) {
    const data = dataRef.current;
    const columns = columnsRef.current;
    if (!data || !columns) return;
    const card = data.cards.find((c) => c.id === cardId);
    if (!card) return;
    snapshot.current = data;
    loadSeq.current.invalidate(); // an older in-flight load must not clobber the optimistic move
    // Where it was, for Undo: computed from the full columns before anything changes.
    const back = undoTarget(columns, cardId);
    const fromStatus = card.status;

    const target = columns[status].filter((c) => c.id !== cardId);
    const position = localPosition(target, beforeId, afterId);
    setData({
      ...data,
      cards: data.cards.map((c) =>
        c.id === cardId
          ? {
              ...c,
              status,
              position,
              completedAt: status === "DONE" && c.status !== "DONE" ? new Date().toISOString() : status !== "DONE" ? null : c.completedAt,
              updatedById: session?.user?.id ?? c.updatedById,
              updatedAt: new Date().toISOString(),
            }
          : c
      ),
    });
    flashLanded(cardId);
    if (opts.refocus) pendingFocus.current = cardId;
    const where = status === fromStatus ? "within " : "to ";
    setAnnouncement(`Moved "${card.title}" ${where}${BOARD_STATUS_LABELS[status]}.`);

    try {
      const res = await fetch(`/api/admin/board/cards/${cardId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(beforeId ? { beforeId } : {}), ...(!beforeId && afterId ? { afterId } : {}) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Couldn't move that item.");
      }
      const saved: BoardCardData = await res.json();
      setData((cur) => (cur ? { ...cur, cards: cur.cards.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)) } : cur));
      if (!opts.undo && back) {
        toast.undo(
          status === fromStatus
            ? `Reordered "${card.title}".`
            : `Moved "${card.title}" to ${BOARD_STATUS_LABELS[status]}.`,
          () => {
            const { status: toStatus, beforeId: b, afterId: a } = back;
            void move(cardId, toStatus, b, a, { undo: true, refocus: opts.refocus });
          }
        );
      }
    } catch (e) {
      setData(snapshot.current);
      // A move is idempotent, so Retry is safe (spec 6.5).
      toast.error(e instanceof Error ? e.message : "Couldn't move that item.", {
        retry: () => void move(cardId, status, beforeId, afterId, opts),
      });
    }
  }

  function nudge(card: BoardCardData, dir: "up" | "down", refocus = false) {
    const list = visible[card.status];
    const i = list.findIndex((c) => c.id === card.id);
    if (dir === "up" && i > 0) move(card.id, card.status, undefined, list[i - 1].id, { refocus });
    if (dir === "down" && i >= 0 && i < list.length - 1) move(card.id, card.status, list[i + 1].id, undefined, { refocus });
  }

  // ── native drag and drop (desktop) ──
  // The column works out the insertion index from the pointer; here we turn it
  // into the move contract and skip a drop back into the same slot.
  function dropAt(status: BoardStatus, index: number) {
    const id = draggingId;
    endDrag();
    if (!id) return;
    const card = data?.cards.find((c) => c.id === id);
    if (!card) return;
    if (isNoopMove(visible[status], id, status, card.status, index)) return;
    const others = visible[status].filter((c) => c.id !== id).map((c) => c.id);
    const n = neighboursForIndex(others, index);
    move(id, status, n.beforeId, n.afterId);
  }
  function endDrag() {
    setDraggingId(null);
    setDropTarget(null);
  }

  async function quickAdd(status: BoardStatus, title: string): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/board/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, status, ownerId: myPersonId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Couldn't add that item.");
      }
      const saved: BoardCardData = await res.json();
      applyCard(saved);
      flashLanded(saved.id);
      setAnnouncement(`Added "${saved.title}" to ${BOARD_STATUS_LABELS[status]}.`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that item.");
      return false;
    }
  }

  function renderCard(card: BoardCardData, list: BoardCardData[], desktop: boolean) {
    const i = list.findIndex((c) => c.id === card.id);
    const mover = card.updatedById ? personByUserId.get(card.updatedById) : undefined;
    return (
      <BoardCard
        key={card.id}
        card={card}
        ownerLabel={card.ownerId ? (personById.get(card.ownerId)?.label ?? null) : null}
        projectName={card.projectId ? (projectById.get(card.projectId)?.name ?? null) : null}
        movedBy={mover?.label ?? null}
        isFirst={i === 0}
        isLast={i === list.length - 1}
        desktop={desktop}
        dragging={draggingId === card.id}
        landed={landedId === card.id}
        onOpen={() => setEditing(card)}
        onResolve={() => setResolving(card)}
        onMoveTo={(s) => move(card.id, s, undefined, undefined, { refocus: true })}
        onNudge={(dir) => nudge(card, dir, true)}
        onDragStart={
          desktop
            ? (e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", card.id);
                setDraggingId(card.id);
              }
            : undefined
        }
        onDragEnd={desktop ? endDrag : undefined}
      />
    );
  }

  const needsReviewCount = data?.needsReviewCount ?? 0;
  const selectCls = "h-9 w-full rounded-sm border border-input bg-card pl-3 text-sm text-foreground sm:w-44";

  // Apply a saved/created/resolved card immediately, then reconcile with the
  // server (a resolve can fix sibling cards; ordering may change).
  function applyCard(saved: BoardCardData | null) {
    if (saved) {
      loadSeq.current.invalidate();
      setData((cur) => (cur ? applyCardToPayload(cur, saved) : cur));
    }
    load();
  }

  // Stuck-filter guard: if the last flagged card is resolved while ?review=1
  // is on, the banner (and its toggle) disappears; drop the filter.
  useEffect(() => {
    if (reviewOnly && data && needsReviewCount === 0) setFilter("review", "");
  }, [reviewOnly, data, needsReviewCount, setFilter]);

  return (
    <AppShell>
      <PageHeader
        title="Team Board"
        description="Action items from team calls and the weekly digest"
        action={
          tab === "board" ? (
            <Button onClick={() => setEditing("new")} disabled={!data}>
              <Plus className="h-4 w-4" /> Add item
            </Button>
          ) : undefined
        }
      />

      {/* Announces moves for screen readers (the card changes place silently). */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="mb-6 flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none]" aria-label="Team board sections">
          {tabs.map((t) => (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              className={cn(
                "shrink-0 border-b-2 border-transparent px-1 pb-2.5 pt-1 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground",
                "data-[state=active]:border-foreground data-[state=active]:text-foreground"
              )}
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="board">
          {loading ? (
            <div className="grid gap-4 py-4 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
          ) : loadError || !data ? (
            <div className="flex flex-wrap items-center gap-3 py-10">
              <p className="text-sm text-tone-clay-ink">{loadError || "Failed to load the board."}</p>
              <Button size="sm" variant="secondary" onClick={() => { setLoading(true); load(); }}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              {/* Filter row: Pattern D */}
              <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
                <label className="flex w-full flex-col gap-1 sm:w-auto">
                  <span className="label">Project</span>
                  <select
                    aria-label="Filter by project"
                    value={projectFilter}
                    onChange={(e) => setFilter("project", e.target.value)}
                    className={selectCls}
                  >
                    <option value="">All projects</option>
                    <option value="none">No project</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-full flex-col gap-1 sm:w-auto">
                  <span className="label">Owner</span>
                  <select
                    aria-label="Filter by owner"
                    value={ownerFilter}
                    onChange={(e) => setFilter("owner", e.target.value)}
                    className={selectCls}
                  >
                    <option value="">All owners</option>
                    {myPersonId && <option value="me">Me</option>}
                    <option value="none">Unassigned</option>
                    {data.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-full flex-col gap-1 sm:w-auto">
                  <span className="label">Search</span>
                  <Input
                    aria-label="Search items"
                    placeholder="Search titles…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 w-full sm:w-56"
                  />
                </label>
              </div>

              {needsReviewCount > 0 && (
                <div
                  role="status"
                  className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border border-ochre bg-ochre/10 px-3 py-2"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-tone-amber-ink" aria-hidden />
                  <p className="min-w-0 flex-1 basis-48 text-sm text-foreground">
                    {reviewOnly
                      ? `Showing ${needsReviewCount} item${needsReviewCount === 1 ? "" : "s"} that need review`
                      : `${needsReviewCount} item${needsReviewCount === 1 ? " needs" : "s need"} review: names or projects Molly couldn't match`}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setFilter("review", reviewOnly ? "" : "1")}
                  >
                    {reviewOnly ? "Show all" : "Show them"}
                  </Button>
                </div>
              )}

              {/* Desktop: four columns */}
              <div className="hidden gap-4 md:grid md:grid-cols-4">
                {BOARD_STATUSES.map((s) => (
                  <BoardColumn
                    key={s}
                    status={s}
                    cards={visible[s].map((c) => ({ id: c.id, node: renderCard(c, visible[s], true) }))}
                    droppable
                    draggingId={draggingId}
                    dropIndex={dropTarget?.status === s ? dropTarget.index : null}
                    onDropIndexChange={(status, index) => setDropTarget(index === null ? null : { status, index })}
                    onDropAt={dropAt}
                    onQuickAdd={quickAdd}
                  />
                ))}
              </div>

              {/* Mobile: stacked collapsible sections, no drag */}
              <div className="space-y-3 md:hidden">
                {BOARD_STATUSES.map((s) => (
                  <details
                    key={s}
                    open={s === "TODO" || s === "IN_PROGRESS"}
                    className="group rounded-sm border border-border"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-foreground [&::-webkit-details-marker]:hidden">
                      <span>{BOARD_STATUS_LABELS[s]}</span>
                      <span className="ml-auto text-muted-foreground">{visible[s].length}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="space-y-2 bg-well p-2">
                      {visible[s].map((c) => renderCard(c, visible[s], false))}
                      {visible[s].length === 0 && <p className="py-3 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Empty</p>}
                    </div>
                  </details>
                ))}
              </div>
            </>
          )}
        </Tabs.Content>

        <Tabs.Content value="people">
          <PeopleProjectsPanel onChanged={load} />
        </Tabs.Content>

        {granolaIntake && (
          <Tabs.Content value="intake">
            <IntakePanel onBoardChanged={load} />
          </Tabs.Content>
        )}
      </Tabs.Root>

      {editing && data && (
        <CardDialog
          card={editing === "new" ? null : editing}
          people={data.people}
          projects={data.projects}
          defaultOwnerId={myPersonId}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            setEditing(null);
            applyCard(c ?? null);
          }}
          onPartialFailure={(msg) => toast.error(msg)}
        />
      )}
      {resolving && data && (
        <ResolveDialog
          card={resolving}
          people={data.people}
          projects={data.projects}
          onClose={() => setResolving(null)}
          onApplied={(c) => applyCard(c)}
          onResolved={() => {
            setResolving(null);
          }}
        />
      )}
    </AppShell>
  );
}
