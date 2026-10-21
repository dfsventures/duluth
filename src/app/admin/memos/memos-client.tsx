"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutGrid, List, Plus, Search, Settings2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { TabBar } from "@/components/ui/tab-bar";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { parseTab } from "@/lib/url-tab";
import { relativeTime } from "@/lib/relative-time";
import { createSequencer } from "@/lib/board-client";
import { matchesQuery } from "@/lib/data-table";
import { MEMO_DECISIONS, MEMO_DECISION_LABELS, MEMO_DECISION_NOUN, MEMO_STATUSES, MEMO_STATUS_LABELS, MEMO_STATUS_NOUN } from "@/lib/memos";
import { COLUMN_LABELS, applyDecision, columnOf, decisionOf, resolveView, type ColumnKey, type MemoView } from "@/lib/memo-board";
import { STATUS_VARIANT, ownerLabel, readError, type LinkTargets, type MemoRow } from "@/components/admin/memos/types";
import { MemoBoard } from "@/components/admin/memos/memo-board";
import { MemoCompanyLabel } from "@/components/admin/memos/memo-company-label";
import { MemoFilters } from "@/components/admin/memos/memo-filters";
import { MemosEmpty } from "@/components/admin/memos/memos-empty";

const VIEW_KEY = "molly.memos.view";
function readStoredView(): string | null {
  try {
    return localStorage.getItem(VIEW_KEY);
  } catch {
    return null; // private window or blocked site data
  }
}
function writeStoredView(v: MemoView) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* not persisted */
  }
}

const SCOPES = ["mine", "team", "all"] as const;
type Scope = (typeof SCOPES)[number];
const TABS = [
  { key: "mine" as const, label: "Mine", hint: "Memos you own, private or shared." },
  { key: "team" as const, label: "Team", hint: "Every memo shared with the team, yours included." },
  { key: "all" as const, label: "Everything", hint: "Your private memos plus everything shared with the team." },
];

export default function MemosClient({ targets }: { targets: LinkTargets }) {
  return (
    <Suspense fallback={null}>
      <MemosInner targets={targets} />
    </Suspense>
  );
}

function MemosInner({ targets }: { targets: LinkTargets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const scope: Scope = parseTab(searchParams.get("tab"), SCOPES, "mine");

  const [rows, setRows] = useState<MemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [decision, setDecision] = useState("");
  const [unlinked, setUnlinked] = useState(false);

  // JC-MB-A: ?view= wins, then the stored choice, then Board. Null until resolved, so no Board-then-List flash.
  const [view, setView] = useState<MemoView | null>(null);
  const viewParam = searchParams.get("view");
  useEffect(() => {
    setView(resolveView(viewParam, readStoredView()));
  }, [viewParam]);
  function switchView(v: MemoView) {
    setView(v);
    writeStoredView(v);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", v);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  // Decision 5: the Decision filter is List-only; the board never sends it (its value is kept for the way back).
  const apiDecision = view === "list" ? decision : "";

  const loadSeq = useRef(createSequencer()); // F142: only the latest load may write
  const rowsRef = useRef<MemoRow[]>(rows);
  rowsRef.current = rows;

  const load = useCallback(async () => {
    const token = loadSeq.current.next();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (companyId.startsWith("c:")) params.set("companyId", companyId.slice(2));
      else if (companyId.startsWith("p:")) params.set("portfolioCompanyId", companyId.slice(2));
      if (status) params.set("status", status);
      if (apiDecision) params.set("decision", apiDecision);
      if (unlinked) params.set("unlinked", "true");
      const res = await fetch(`/api/admin/memos?${params}`);
      if (!res.ok) throw new Error("Couldn't load memos.");
      const data: MemoRow[] = await res.json();
      if (!loadSeq.current.isCurrent(token)) return;
      setRows(data);
      setTruncated(res.headers.get("X-Memos-Truncated") === "1");
    } catch (e) {
      if (!loadSeq.current.isCurrent(token)) return;
      setError(e instanceof Error ? e.message : "Couldn't load memos.");
    } finally {
      if (loadSeq.current.isCurrent(token)) setLoading(false);
    }
  }, [scope, companyId, status, apiDecision, unlinked]);
  useEffect(() => {
    if (view !== null) void load();
  }, [load, view]);

  const me = session?.user?.id;
  const filtered = !!(companyId || status || unlinked || (view === "list" && decision));
  const applyFilters = (patch: Partial<{ companyId: string; status: string; decision: string; unlinked: boolean }>) => {
    if (patch.companyId !== undefined) setCompanyId(patch.companyId);
    if (patch.status !== undefined) setStatus(patch.status);
    if (patch.decision !== undefined) setDecision(patch.decision);
    if (patch.unlinked !== undefined) setUnlinked(patch.unlinked);
  };
  const clearFilters = () => {
    setCompanyId("");
    setStatus("");
    setDecision("");
    setUnlinked(false);
  };

  // Board search: the same ?q= and haystack as the list's DataTable, so it carries across views.
  const q = (searchParams.get("q") ?? "").slice(0, 200);
  const [qInput, setQInput] = useState(q);
  const lastWrittenQ = useRef(q);
  useEffect(() => {
    if (q !== lastWrittenQ.current) {
      lastWrittenQ.current = q;
      setQInput(q);
    }
  }, [q]);
  useEffect(() => {
    if (view !== "board" || qInput === q) return;
    const t = setTimeout(() => {
      lastWrittenQ.current = qInput;
      const params = new URLSearchParams(searchParams.toString());
      if (qInput) params.set("q", qInput);
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [qInput, q, view, searchParams, router, pathname]);
  const boardRows = useMemo(
    () => rows.filter((m) => matchesQuery([m.title, m.companyRef.kind === "none" ? null : m.companyRef.name], q)),
    [rows, q]
  );

  // WS142.6: optimistic move with Undo. Undo is a second move that reads the fresh version from rowsRef.
  const [announcement, setAnnouncement] = useState("");
  const [landedId, setLandedId] = useState<string | null>(null);
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (landedTimer.current && clearTimeout(landedTimer.current)), []);
  const flashLanded = (id: string) => {
    setLandedId(id);
    if (landedTimer.current) clearTimeout(landedTimer.current);
    landedTimer.current = setTimeout(() => setLandedId(null), 900);
  };

  async function move(id: string, to: ColumnKey, opts: { undo?: boolean } = {}): Promise<void> {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || !row.canEdit || columnOf(row.decision) === to) return;
    const snapshot = rowsRef.current;
    const label = COLUMN_LABELS[to];
    loadSeq.current.invalidate(); // an older in-flight load must not undo the optimistic move
    setLoading(false);
    setRows(applyDecision(snapshot, id, decisionOf(to)));
    flashLanded(id);
    setAnnouncement(`"${row.title}" moved to ${label}.`);
    try {
      const res = await fetch(`/api/admin/memos/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decisionOf(to), expectedVersion: row.version, ...(opts.undo ? { undo: true } : {}) }),
      });
      if (res.ok) {
        const saved: { decision: MemoRow["decision"]; version: number } = await res.json();
        setRows((cur) => applyDecision(cur, id, saved.decision, saved.version));
        if (!opts.undo) {
          toast.undo(`"${row.title}" moved to ${label}.`, () => void move(id, columnOf(row.decision), { undo: true }));
        }
        return;
      }
      const failed = `Couldn't move "${row.title}". Check your connection and try again.`;
      const message = await readError(res, failed);
      setRows(snapshot);
      if (res.status === 409) {
        // Someone changed the memo meanwhile. The same version would fail again, so no Retry.
        toast.error(`Someone else just updated "${row.title}". Reload to see the latest, then move it again.`, { action: { label: "Reload", onClick: () => void load() } });
      } else if (res.status === 403 || res.status === 404) {
        toast.error(message);
        void load(); // made private, archived or moved out of reach
      } else {
        toast.error(`Couldn't move "${row.title}". Check your connection and try again.`, { retry: () => void move(id, to, opts) });
      }
    } catch {
      setRows(snapshot);
      toast.error(`Couldn't move "${row.title}". Check your connection and try again.`, { retry: () => void move(id, to, opts) });
    }
  }

  const columns = useMemo<DataTableColumn<MemoRow>[]>(
    () => [
      {
        key: "title",
        header: "Memo",
        sortValue: (m) => m.title.toLowerCase(),
        cell: (m) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{m.title}</span>
            {m.draftedByMarge && <Badge variant="info">Drafted by Marge</Badge>}
          </span>
        ),
      },
      {
        key: "company",
        header: "Company",
        sortValue: (m) => (m.companyRef.kind === "none" ? "" : m.companyRef.name).toLowerCase(),
        mobile: "meta",
        cell: (m) => <MemoCompanyLabel companyRef={m.companyRef} />,
      },
      {
        key: "status",
        header: MEMO_STATUS_NOUN,
        sortValue: (m) => MEMO_STATUSES.indexOf(m.status),
        mobile: "badge",
        cell: (m) => <Badge variant={STATUS_VARIANT[m.status]}>{MEMO_STATUS_LABELS[m.status]}</Badge>,
      },
      {
        key: "decision",
        header: MEMO_DECISION_NOUN,
        sortValue: (m) => (m.decision ? MEMO_DECISIONS.indexOf(m.decision) : MEMO_DECISIONS.length),
        mobile: "meta",
        cell: (m) => (m.decision ? <Badge variant="neutral">{MEMO_DECISION_LABELS[m.decision]}</Badge> : <span className="text-muted-foreground">—</span>),
      },
      {
        key: "owner",
        header: "Owner",
        sortValue: (m) => ownerLabel(m.owner).toLowerCase(),
        mobile: "meta",
        cell: (m) => (m.owner.id === me ? "You" : ownerLabel(m.owner)),
      },
      {
        key: "visibility",
        header: "Visibility",
        sortValue: (m) => m.visibility,
        mobile: "meta",
        cell: (m) => <Badge variant={m.visibility === "TEAM" ? "info" : "neutral"}>{m.visibility === "TEAM" ? "Team" : "Private"}</Badge>,
      },
      {
        key: "updated",
        header: "Updated",
        sortValue: (m) => m.updatedAt,
        firstDir: "desc",
        mobile: "meta",
        cell: (m) => <span title={new Date(m.updatedAt).toLocaleString()}>{relativeTime(m.updatedAt)}</span>,
      },
    ],
    [me]
  );

  return (
    <AppShell>
      <PageHeader
        title="Memos"
        description="Your team's deal pipeline and investment memos. New memos are private until the owner shares them."
        action={
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => router.push("/admin/memos/template")}>
              <Settings2 className="h-4 w-4" />
              Memo template
            </Button>
            <Button onClick={() => router.push("/admin/memos/new")}>
              <Plus className="h-4 w-4" />
              New memo
            </Button>
          </div>
        }
      />

      <TabBar tabs={TABS} active={scope} fallback="mine" label="Memo lists" />

      <div className="mb-4 flex sm:justify-end">
        <div role="group" aria-label="Memo view" className="flex w-full gap-1.5 sm:w-auto">
          {(
            [
              { key: "board", label: "Board", Icon: LayoutGrid },
              { key: "list", label: "List", Icon: List },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => switchView(key)}
              className={cn(
                "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-chip border px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
                view === key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-secondary hover:border-[var(--color-border-hover)] hover:text-foreground"
              )}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {truncated && view !== null && (
        <p className="mb-3 text-sm text-muted-foreground">Showing the 200 most recently updated memos. Use the filters to narrow.</p>
      )}

      {/* Announces moves for screen readers (the card changes place silently). */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {view === "board" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] max-w-sm flex-1 basis-56">
              <label htmlFor="memo-board-search" className="sr-only">
                Search memos
              </label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="memo-board-search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && qInput) setQInput("");
                }}
                placeholder="Search memos"
                autoComplete="off"
                className="h-8 w-full rounded-ctl border border-input bg-card pl-8 pr-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <MemoFilters
              targets={targets}
              companyId={companyId}
              status={status}
              decision={decision}
              unlinked={unlinked}
              showDecision={false}
              onChange={applyFilters}
            />
          </div>
          {loading && rows.length === 0 ? (
            <p role="status" className="py-10 text-center text-sm text-muted-foreground">
              Loading memos…
            </p>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="mb-3 text-sm text-muted-foreground">{error}</p>
              <Button variant="secondary" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          ) : boardRows.length === 0 ? (
            <MemosEmpty filtered={filtered || !!q} scope={scope} onClear={() => { clearFilters(); setQInput(""); }} />
          ) : (
            <MemoBoard rows={boardRows} me={me} onMove={(id, to) => void move(id, to)} landedId={landedId} />
          )}
        </>
      ) : (
        <DataTable<MemoRow>
          label="Memos"
          noun="memo"
          rows={view === "list" ? rows : []}
          rowKey={(m) => m.id}
          columns={columns}
          rowHref={(m) => `/admin/memos/${m.id}`}
          defaultSort={{ key: "updated", dir: "desc" }}
          searchText={(m) => [m.title, m.companyRef.kind === "none" ? null : m.companyRef.name]}
          searchPlaceholder="Search memos"
          loading={loading || view === null}
          error={error}
          onRetry={load}
          minWidth={720}
          toolbarExtra={
            <MemoFilters
              targets={targets}
              companyId={companyId}
              status={status}
              decision={decision}
              unlinked={unlinked}
              showDecision
              onChange={applyFilters}
            />
          }
          empty={<MemosEmpty filtered={filtered} scope={scope} onClear={clearFilters} />}
        />
      )}
    </AppShell>
  );
}
