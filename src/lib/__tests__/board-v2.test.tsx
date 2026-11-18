import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// PLAN-1, WS162. The Team Board and Memo board in the new look. useNewLook is mocked so both looks
// render on the server (the real hook reads localStorage after hydration).
const look = vi.hoisted(() => ({ v2: true }));
vi.mock("@/lib/use-new-look", () => ({ useNewLook: () => look.v2 }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/board",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { BoardCard } from "@/components/admin/board/board-card";
import { BoardColumn } from "@/components/admin/board/board-column";
import { CardPane } from "@/components/admin/board/card-sheet";
import { MemoBoardCard } from "@/components/admin/memos/memo-board-card";
import type { BoardCardData } from "@/components/admin/board/types";
import type { MemoRow } from "@/components/admin/memos/types";

const card = (over: Partial<BoardCardData> = {}): BoardCardData => ({
  id: "c1",
  title: "Send the sample figures to Example Co",
  notes: null,
  status: "IN_PROGRESS",
  position: 1,
  dueDate: null,
  projectId: null,
  ownerIds: ["p1"],
  unmatchedOwnerNames: [],
  ownerId: null,
  rawOwnerName: null,
  rawProjectName: null,
  needsReview: false,
  completedAt: null,
  archivedAt: null,
  updatedById: null,
  updatedAt: "2026-11-01T10:00:00.000Z",
  links: [],
  ...over,
});

const noop = () => {};
function tile(c: BoardCardData, extra: Partial<React.ComponentProps<typeof BoardCard>> = {}) {
  return renderToStaticMarkup(
    <BoardCard
      card={c}
      ownerLabels={["Sample Person"]}
      projectName={null}
      movedBy={null}
      isFirst={false}
      isLast={false}
      desktop
      dragging={false}
      landed={false}
      onOpen={noop}
      onEdit={noop}
      onResolve={noop}
      onMoveTo={noop}
      onNudge={noop}
      {...extra}
    />
  );
}

describe("Team Board tile", () => {
  it("new look: a blocked tile carries the red dog-ear and the Blocked marker", () => {
    look.v2 = true;
    const html = tile(card({ status: "BLOCKED" }));
    expect(html).toContain("before:right-0");
    expect(html).toContain("--color-stuck");
    expect(html).toContain(">Blocked<");
    expect(html).toContain("data-blocked");
  });

  it("new look: a plain tile has no dog-ear and no marker line", () => {
    look.v2 = true;
    const html = tile(card());
    expect(html).not.toContain("before:right-0");
    expect(html).not.toContain(">Blocked<");
  });

  it("new look: no left-edge bar and no border on any tile", () => {
    look.v2 = true;
    for (const status of ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const) {
      const html = tile(card({ status }));
      expect(html).not.toMatch(/border-l-|before:left-0|border-border/);
    }
  });

  it("new look: the cursor is the Sky underscore block on the lower edge, shown on focus", () => {
    look.v2 = true;
    const html = tile(card());
    expect(html).toContain("after:bg-mark");
    expect(html).toContain("focus-within:after:block");
  });

  it("new look: owners are discs, the title is up to 3 lines, overdue reads Overdue", () => {
    look.v2 = true;
    const html = tile(card({ dueDate: "2020-01-01T00:00:00.000Z" }));
    expect(html).toContain("rounded-full");
    expect(html).toContain("line-clamp-3");
    expect(html).toContain(">Overdue<");
  });

  it("new look: drag, title button and the card menu are all still there", () => {
    look.v2 = true;
    const html = tile(card());
    expect(html).toContain('draggable="true"');
    expect(html).toContain("data-card-title");
    expect(html).toContain('aria-label="Actions for &quot;Send the sample figures to Example Co&quot;"');
  });

  it("new look on touch keeps the Move-to select and arrows", () => {
    look.v2 = true;
    const html = tile(card(), { desktop: false });
    expect(html).toContain("Move to…");
    expect(html).toContain('&quot; up"');
    expect(html).toContain('&quot; down"');
  });

  it("old look is unchanged: bordered, no dog-ear, no Overdue word, old title size", () => {
    look.v2 = false;
    const html = tile(card({ status: "BLOCKED", dueDate: "2020-01-01T00:00:00.000Z" }));
    expect(html).toContain("border border-border bg-card");
    expect(html).toContain("text-sm text-foreground hover:underline");
    expect(html).not.toContain("before:right-0");
    expect(html).not.toContain("data-blocked");
    expect(html).toContain("Overdue ");
  });
});

describe("Team Board column", () => {
  const col = (hot: boolean) =>
    renderToStaticMarkup(
      <BoardColumn
        status="BLOCKED"
        cards={[]}
        droppable
        draggingId={null}
        dropIndex={null}
        onDropIndexChange={noop}
        onDropAt={noop}
        hot={hot}
        onQuickAdd={async () => true}
      />
    );

  it("a hot Blocked column colours its name and count in the stuck colour, new look only", () => {
    const html = col(true);
    expect(html).toContain("v2:text-[color:var(--color-stuck)]");
    expect(col(false)).not.toContain("v2:text-[color:var(--color-stuck)]");
  });

  it("has a 36px header and 36px add button and 12px between tiles under v2, and the old classes still apply", () => {
    const html = col(false);
    expect(html).toContain("v2:h-9");
    expect(html).toContain("v2:gap-3");
    expect(html).toContain("v2:bg-transparent");
    expect(html).toContain("bg-well p-2");
    expect(html).toContain("Add item");
  });
});

describe("Card pane", () => {
  const pane = (c: BoardCardData) =>
    renderToStaticMarkup(
      <CardPane
        card={c}
        ownerLabels={["Sample Person"]}
        projectName="Sample project"
        userLabel={() => "Sample Person"}
        crumb="Team Board · Blocked · 1 of 1"
        onEdit={noop}
        onClose={noop}
        onLinksChanged={noop}
        onUnblock={noop}
      />
    );

  it("a blocked item: Mark as unblocked is the primary, Edit is secondary, the action card has the dog-ear", () => {
    const html = pane(card({ status: "BLOCKED" }));
    expect(html).toContain("Mark as unblocked");
    expect(html.indexOf("Edit")).toBeGreaterThan(html.indexOf("Mark as unblocked"));
    expect(html).toContain("This item is stuck.");
    expect(html).toContain("before:right-0");
    expect(html).toContain("Team Board · Blocked · 1 of 1");
  });

  it("any other item has only Edit and no action card", () => {
    const html = pane(card());
    expect(html).not.toContain("Mark as unblocked");
    expect(html).not.toContain("before:right-0");
    expect(html).toContain("Edit");
  });

  it("keeps notes, proof links, details and history, in that order", () => {
    const html = pane(card());
    const at = ["Notes", "Proof links (0/10)", "Details", "History"].map((s) => html.indexOf(s));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe("Memo board tile", () => {
  const memo: MemoRow = {
    id: "m1",
    title: "Example Co seed memo",
    companyId: null,
    companyNamePending: null,
    status: "DRAFT",
    visibility: "TEAM",
    draftedByMarge: false,
    decision: "IN_PROGRESS",
    tags: [],
    version: 1,
    updatedAt: "2020-01-01T00:00:00.000Z",
    company: null,
    companyRef: { kind: "none" },
    owner: { id: "u1", name: "Sample Person", email: "sample@example.com" },
    canEdit: true,
  };
  const html = renderToStaticMarkup(
    <MemoBoardCard memo={memo} me="u1" desktop showOwner onMoveTo={noop} />
  );

  it("takes the same tile anatomy in the new look and keeps the old classes for the old look", () => {
    expect(html).toContain("v2:rounded-md");
    expect(html).toContain("v2:border-0");
    expect(html).toContain("v2:after:bg-mark");
    expect(html).toContain("border border-border bg-card");
  });

  it("keeps the Idle amber time", () => {
    expect(html).toContain("text-tone-amber-ink");
    expect(html).toContain("Idle");
  });

  it("has no left-edge bar", () => {
    expect(html).not.toMatch(/border-l-|before:left-0/);
  });
});
