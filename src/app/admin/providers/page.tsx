"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Plus,
  X,
  Building2,
  User,
  ExternalLink,
  Linkedin,
  MapPin,
  ThumbsUp,
  Pencil,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ModalDialog as Modal } from "@/components/ui/dialog";
import { ModalSheet } from "@/components/ui/sheet";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useNewLook } from "@/lib/use-new-look";
import type { FilterChipDef } from "@/lib/data-table";

interface Category {
  id: string;
  name: string;
}

interface Provider {
  id: string;
  type: "FIRM" | "INDIVIDUAL";
  name: string;
  website: string | null;
  linkedin: string | null;
  category: { id: string; name: string };
  description: string | null;
  contactEmail: string | null;
  country: string | null;
  city: string | null;
  status: "PENDING" | "VETTED" | "REJECTED";
  endorsementCount: number;
  submittedBy: { id: string; name: string | null } | null;
  endorsements: { id: string; userId: string; note: string; user: { name: string | null } }[];
}

export default function AdminProvidersPage() {
  const newLook = useNewLook();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "PENDING" | "VETTED" | "REJECTED">("");
  const [actionStates, setActionStates] = useState<Record<string, { loading: boolean }>>({});

  // Add category modal
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [addCategoryError, setAddCategoryError] = useState("");

  // Edit / add modal
  const [editTarget, setEditTarget] = useState<Provider | "new" | null>(null);
  const [editForm, setEditForm] = useState<Partial<Provider & { categoryId: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      else params.set("status", "ALL");

      const [provRes, catRes] = await Promise.all([
        fetch(`/api/providers?${params}`),
        fetch("/api/providers/categories"),
      ]);
      if (provRes.ok) {
        const data: Provider[] = await provRes.json();
        setProviders(data);
      }
      if (catRes.ok) setCategories(await catRes.json());
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  async function setStatus(id: string, status: "VETTED" | "REJECTED") {
    setActionStates((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      await fetch(`/api/admin/providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      loadData();
    } finally {
      setActionStates((prev) => ({ ...prev, [id]: { loading: false } }));
    }
  }

  const confirm = useConfirm();
  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete this provider", description: "This cannot be undone.", confirmLabel: "Delete provider" }))) return;
    await fetch(`/api/admin/providers/${id}`, { method: "DELETE" });
    loadData();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setAddingCategory(true);
    setAddCategoryError("");
    try {
      const res = await fetch("/api/admin/providers/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed");
      }
      setShowAddCategory(false);
      setNewCategoryName("");
      loadData();
    } catch (err) {
      setAddCategoryError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAddingCategory(false);
    }
  }

  function openNew() {
    setEditTarget("new");
    setEditForm({ type: "FIRM", status: "VETTED", categoryId: categories[0]?.id ?? "" });
    setSaveError("");
  }

  function openEdit(p: Provider) {
    setEditTarget(p);
    setEditForm({ ...p, categoryId: p.category.id });
    setSaveError("");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    setSaveError("");
    try {
      const isNew = editTarget === "new";
      const url = isNew ? "/api/admin/providers" : `/api/admin/providers/${(editTarget as Provider).id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save");
      }
      setEditTarget(null);
      loadData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const pending = providers.filter((p) => p.status === "PENDING");
  const rest = providers.filter((p) => p.status !== "PENDING");

  // New look: the directory is small, so the status chips and the search run in the browser over
  // everything the page loads (status=ALL). The two tables are the Pending queue and the rest.
  const providerColumns = (): DataTableColumn<Provider>[] => [
    {
      key: "name",
      header: "Provider",
      sortValue: (p) => p.name,
      title: (p) => p.description,
      cell: (p) => (
        <>
          <span className="mr-3 inline-flex h-5 w-5 flex-none items-center justify-center rounded bg-primary-50 text-primary">
            {p.type === "FIRM" ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
          </span>
          <span className="min-w-0 truncate">{p.name}</span>
        </>
      ),
    },
    { key: "category", header: "Category", mobile: "meta", sortValue: (p) => p.category.name, cell: (p) => p.category.name },
    {
      key: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (p) => p.status,
      cell: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: "where",
      header: "Location",
      dropBelow: 600,
      sortValue: (p) => [p.city, p.country].filter(Boolean).join(", "),
      cell: (p) => [p.city, p.country].filter(Boolean).join(", ") || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "links",
      header: "Links",
      dropBelow: 600,
      cell: (p) =>
        p.website || p.linkedin ? (
          <span className="flex items-center gap-3">
            {p.website && (
              <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Website
              </a>
            )}
            {p.linkedin && (
              <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Linkedin className="h-3 w-3" /> LinkedIn
              </a>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "by",
      header: "Submitted by",
      dropBelow: 480,
      sortValue: (p) => p.submittedBy?.name,
      cell: (p) => (p.submittedBy ? (p.submittedBy.name ?? "a founder") : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "endorsements",
      header: "Endorsements",
      align: "num",
      dropBelow: 480,
      sortValue: (p) => p.endorsementCount ?? p.endorsements?.length ?? 0,
      cell: (p) => p.endorsementCount ?? p.endorsements?.length ?? 0,
    },
  ];
  const providerActions = (p: Provider, approve?: () => void, reject?: () => void) => (
    <>
      {approve && (
        <Button size="sm" onClick={approve} disabled={!!actionStates[p.id]?.loading}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          {p.status === "REJECTED" ? "Restore" : "Approve"}
          <span className="sr-only"> {p.name}</span>
        </Button>
      )}
      {reject && (
        <Button size="sm" variant="secondary" onClick={reject} disabled={!!actionStates[p.id]?.loading} className="text-tone-clay-ink">
          <XCircle className="h-3.5 w-3.5" />
          Reject
          <span className="sr-only"> {p.name}</span>
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
        <Pencil className="h-3.5 w-3.5" />
        <span className="sr-only">Edit {p.name}</span>
      </Button>
      <Button size="sm" variant="ghost" className="hover:text-tone-clay-ink" onClick={() => handleDelete(p.id)}>
        <Trash2 className="h-3.5 w-3.5" />
        <span className="sr-only">Delete {p.name}</span>
      </Button>
    </>
  );
  const REST_CHIPS: FilterChipDef<Provider>[] = [
    { key: "vetted", label: "Vetted", test: (p) => p.status === "VETTED" },
    { key: "rejected", label: "Rejected", test: (p) => p.status === "REJECTED" },
  ];

  return (
    <AppShell width={newLook ? "wide" : undefined}>
      <PageHeader
        title="Service Providers"
        description="Review submissions and manage the provider directory."
        secondaryActions={
          newLook
            ? [{ label: "Add Category", icon: <Plus className="h-4 w-4" />, onSelect: () => setShowAddCategory(true) }]
            : undefined
        }
        action={
          <div className="flex flex-wrap gap-3">
            {!newLook && (
              <Button variant="secondary" onClick={() => setShowAddCategory(true)}>
                <Plus className="h-4 w-4" />
                Add Category
              </Button>
            )}
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Add Provider
            </Button>
          </div>
        }
      />

      {newLook && (
        <div className="space-y-12">
          {pending.length > 0 && (
            <section aria-labelledby="providers-pending">
              <h2 id="providers-pending" className="mx-[var(--row-pad)] mb-3 text-meta font-medium text-foreground">
                Pending review <span className="ml-1 tabular-nums text-muted-foreground">{pending.length}</span>
              </h2>
              <DataTable<Provider>
                label="Providers pending review"
                noun="provider"
                rows={pending}
                rowKey={(p) => p.id}
                columns={providerColumns()}
                defaultSort={{ key: "name", dir: "asc" }}
                urlState={false}
                minWidth={760}
                actionsLabel="Row actions"
                actionsAlwaysVisible
                rowActions={(p) => providerActions(p, () => setStatus(p.id, "VETTED"), () => setStatus(p.id, "REJECTED"))}
                loading={loading}
                empty={null}
              />
            </section>
          )}
          {(rest.length > 0 || pending.length === 0) && <section aria-labelledby="providers-all">
            {rest.length > 0 && (
              <h2 id="providers-all" className="mx-[var(--row-pad)] mb-3 text-meta font-medium text-foreground">
                All providers <span className="ml-1 tabular-nums text-muted-foreground">{rest.length}</span>
              </h2>
            )}
            <DataTable<Provider>
              label="Service providers"
              noun="provider"
              rows={rest}
              rowKey={(p) => p.id}
              columns={providerColumns()}
              defaultSort={{ key: "name", dir: "asc" }}
              urlState={false}
              minWidth={760}
              searchText={(p) => [p.name, p.category.name, p.city, p.country]}
              searchPlaceholder="Filter providers"
              chips={REST_CHIPS}
              rowActions={(p) =>
                providerActions(
                  p,
                  p.status === "REJECTED" ? () => setStatus(p.id, "VETTED") : undefined,
                  p.status === "VETTED" ? () => setStatus(p.id, "REJECTED") : undefined
                )
              }
              actionsLabel="Row actions"
              loading={loading}
              empty={
                <EmptyState
                  className="mx-[var(--row-pad)] py-3"
                  eyebrow="Service Providers"
                  icon={<Building2 className="h-8 w-8" />}
                  title="No providers found"
                  description="Adjust filters or wait for submissions."
                />
              }
            />
          </section>}
        </div>
      )}

      {/* Filters */}
      {!newLook && <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search providers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border border-border overflow-hidden text-sm font-medium">
          {([
            { value: "", label: "All" },
            { value: "PENDING", label: "Pending" },
            { value: "VETTED", label: "Vetted" },
            { value: "REJECTED", label: "Rejected" },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-2 transition-colors ${statusFilter === value ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
            >
              {label}
              {value === "PENDING" && pending.length > 0 && (
                <span className="ml-1.5 rounded-full bg-ochre text-obsidian text-xs px-1.5 py-0.5">{pending.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>}

      {newLook ? null : loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-md bg-muted animate-pulse" />)}
        </div>
      ) : providers.length === 0 ? (
        <EmptyState eyebrow="Service Providers" icon={<Building2 className="h-8 w-8" />} title="No providers found" description="Adjust filters or wait for submissions." />
      ) : (
        <div className="space-y-6">
          {/* Pending queue */}
          {(statusFilter === "" || statusFilter === "PENDING") && pending.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Pending Review ({pending.length})
              </h2>
              <div className="space-y-4">
                {pending.map((p) => (
                  <ProviderRow
                    key={p.id}
                    provider={p}
                    loading={!!actionStates[p.id]?.loading}
                    onApprove={() => setStatus(p.id, "VETTED")}
                    onReject={() => setStatus(p.id, "REJECTED")}
                    onEdit={() => openEdit(p)}
                    onDelete={() => handleDelete(p.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Vetted + rejected */}
          {(statusFilter === "" || statusFilter !== "PENDING") && rest.length > 0 && (
            <section>
              {statusFilter === "" && (
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                  All Providers ({rest.length})
                </h2>
              )}
              <div className="space-y-4">
                {rest.map((p) => (
                  <ProviderRow
                    key={p.id}
                    provider={p}
                    loading={!!actionStates[p.id]?.loading}
                    onApprove={p.status === "REJECTED" ? () => setStatus(p.id, "VETTED") : undefined}
                    onReject={p.status === "VETTED" ? () => setStatus(p.id, "REJECTED") : undefined}
                    onEdit={() => openEdit(p)}
                    onDelete={() => handleDelete(p.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Add category modal */}
      {showAddCategory && (
        <Modal title="Add Category" onClose={() => setShowAddCategory(false)}>
          <form onSubmit={handleAddCategory} className="space-y-4">
            <div>
              <label className="label mb-1.5 block">Category name *</label>
              <Input
                autoFocus
                required
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Accounting & Tax"
              />
            </div>
            {addCategoryError && <p className="text-sm text-tone-clay-ink">{addCategoryError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddCategory(false)}>Cancel</Button>
              <Button type="submit" disabled={addingCategory}>{addingCategory ? "Adding..." : "Add Category"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add / edit modal */}
      {editTarget && (
        <ModalSheet className="sm:max-w-[520px]" title={editTarget === "new" ? "Add Provider" : `Edit — ${(editTarget as Provider).name}`} onClose={() => setEditTarget(null)}>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Name *">
                <Input required value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Type">
                <Select
                  value={editForm.type ?? "FIRM"}
                  onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value as "FIRM" | "INDIVIDUAL" }))}
                >
                  <option value="FIRM">Firm</option>
                  <option value="INDIVIDUAL">Individual</option>
                </Select>
              </Field>
            </div>

            <Field label="Category *">
              <Select
                required
                value={editForm.categoryId ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>

            <Field label="Website">
              <Input value={editForm.website ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://..." />
            </Field>
            <Field label="LinkedIn">
              <Input value={editForm.linkedin ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, linkedin: e.target.value }))} placeholder="https://linkedin.com/in/..." />
            </Field>
            <Field label="Description">
              <textarea
                value={editForm.description ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Country">
                <Input value={editForm.country ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))} />
              </Field>
              <Field label="City">
                <Input value={editForm.city ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} />
              </Field>
            </div>

            <Field label="Contact email">
              <Input value={editForm.contactEmail ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, contactEmail: e.target.value }))} type="email" />
            </Field>

            <Field label="Status">
              <Select
                value={editForm.status ?? "PENDING"}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as Provider["status"] }))}
              >
                <option value="PENDING">Pending</option>
                <option value="VETTED">Vetted</option>
                <option value="REJECTED">Rejected</option>
              </Select>
            </Field>

            {saveError && <p className="text-sm text-tone-clay-ink">{saveError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editTarget === "new" ? "Add Provider" : "Save Changes"}
              </Button>
            </div>
          </form>
        </ModalSheet>
      )}
    </AppShell>
  );
}

// ─── Provider Row ──────────────────────────────────────────

function ProviderRow({
  provider: p,
  loading,
  onApprove,
  onReject,
  onEdit,
  onDelete,
}: {
  provider: Provider;
  loading: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        {/* Icon */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
          {p.type === "FIRM" ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
        </div>

        {/* Info — min-w keeps the text column readable on phones: instead of
            being squeezed to one word per line by the shrink-0 action cluster,
            the cluster wraps onto its own row (the parent is flex-wrap) */}
        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-foreground text-sm">{p.name}</span>
            <span className="text-xs text-muted-foreground">{p.category.name}</span>
            <StatusBadge status={p.status} />
          </div>
          {(p.city || p.country) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <MapPin className="h-3 w-3" />
              {[p.city, p.country].filter(Boolean).join(", ")}
            </p>
          )}
          {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {p.website && (
              <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Website
              </a>
            )}
            {p.linkedin && (
              <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Linkedin className="h-3 w-3" /> LinkedIn
              </a>
            )}
            {p.submittedBy && (
              <span className="text-xs text-muted-foreground">Submitted by {p.submittedBy.name ?? "a founder"}</span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ThumbsUp className="h-3 w-3" /> {p.endorsementCount ?? p.endorsements?.length ?? 0} endorsement{(p.endorsementCount ?? p.endorsements?.length ?? 0) !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-tone-clay-ink transition-colors" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
          {onApprove && (
            <Button size="sm" onClick={onApprove} disabled={loading}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {p.status === "REJECTED" ? "Restore" : "Approve"}
            </Button>
          )}
          {onReject && (
            <Button size="sm" variant="secondary" onClick={onReject} disabled={loading} className="text-tone-clay-ink border-laterite/30 hover:bg-laterite/10">
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────

function StatusBadge({ status }: { status: Provider["status"] }) {
  if (status === "VETTED") {
    return (
      <span className="badge-success">
        <CheckCircle2 className="h-3 w-3" /> Vetted
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="badge-danger">
        <XCircle className="h-3 w-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="badge-warning">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
