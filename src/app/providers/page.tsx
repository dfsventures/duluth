"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Search,
  Plus,
  X,
  CheckCircle2,
  Clock,
  ExternalLink,
  Linkedin,
  Mail,
  MapPin,
  ChevronDown,
  Building2,
  User,
  ThumbsUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ORG_NAME } from "@/lib/org";

interface Category {
  id: string;
  name: string;
}

interface Endorsement {
  id: string;
  userId: string;
  note: string;
  createdAt: string;
  user: { id: string; name: string | null };
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
  endorsements: Endorsement[];
  endorsementCount: number;
  userEndorsement: Endorsement | null;
  submittedBy: { id: string; name: string | null } | null;
}

export default function ProvidersPage() {
  const { data: session } = useSession();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "VETTED" | "PENDING">("");

  // Submit modal state
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [form, setForm] = useState({
    type: "FIRM" as "FIRM" | "INDIVIDUAL",
    name: "",
    website: "",
    linkedin: "",
    categoryId: "",
    description: "",
    contactEmail: "",
    country: "",
    city: "",
    endorsementNote: "",
  });

  // Endorse modal state
  const [endorseTarget, setEndorseTarget] = useState<Provider | null>(null);
  const [endorseNote, setEndorseNote] = useState("");
  const [endorsing, setEndorsing] = useState(false);
  const [endorseError, setEndorseError] = useState("");

  // Expanded endorsements
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedCategory) params.set("categoryId", selectedCategory);
      if (statusFilter) params.set("status", statusFilter);

      const [providersRes, categoriesRes] = await Promise.all([
        fetch(`/api/providers?${params}`),
        fetch("/api/providers/categories"),
      ]);
      if (providersRes.ok) setProviders(await providersRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to submit");
      }
      setShowSubmit(false);
      setForm({ type: "FIRM", name: "", website: "", linkedin: "", categoryId: "", description: "", contactEmail: "", country: "", city: "", endorsementNote: "" });
      loadData();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEndorse(e: React.FormEvent) {
    e.preventDefault();
    if (!endorseTarget) return;
    setEndorsing(true);
    setEndorseError("");
    try {
      const res = await fetch(`/api/providers/${endorseTarget.id}/endorse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: endorseNote }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to endorse");
      }
      setEndorseTarget(null);
      setEndorseNote("");
      loadData();
    } catch (err) {
      setEndorseError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEndorsing(false);
    }
  }

  async function handleRemoveEndorsement(providerId: string) {
    await fetch(`/api/providers/${providerId}/endorse`, { method: "DELETE" });
    loadData();
  }

  const vetted = providers.filter((p) => p.status === "VETTED");
  const pending = providers.filter((p) => p.status === "PENDING");
  const displayed = statusFilter === "VETTED" ? vetted : statusFilter === "PENDING" ? pending : providers;

  return (
    <AppShell>
      <PageHeader
        title="Service Providers"
        description="Vetted firms and individuals who can help your company grow."
        action={
          <Button onClick={() => setShowSubmit(true)}>
            <Plus className="h-4 w-4" />
            Submit a Provider
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search providers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex rounded-md border border-border overflow-hidden text-sm font-medium">
          {(["", "VETTED", "PENDING"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
            >
              {s === "" ? "All" : s === "VETTED" ? "Vetted" : "Community"}
            </button>
          ))}
        </div>
      </div>

      {/* Counts */}
      {!loading && (
        <p className="mb-4 text-xs text-muted-foreground font-mono uppercase tracking-wider">
          {displayed.length} provider{displayed.length !== 1 ? "s" : ""}{" "}
          {statusFilter === "" && `· ${vetted.length} vetted · ${pending.length} community`}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-52 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="No providers found"
          description="Try adjusting your filters, or be the first to submit one."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              currentUserId={session?.user?.id ?? ""}
              expanded={expandedId === p.id}
              onToggleExpand={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onEndorse={() => { setEndorseTarget(p); setEndorseNote(p.userEndorsement?.note ?? ""); }}
              onRemoveEndorsement={() => handleRemoveEndorsement(p.id)}
            />
          ))}
        </div>
      )}

      {/* Submit modal */}
      {showSubmit && (
        <Modal title="Submit a Service Provider" onClose={() => setShowSubmit(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type toggle */}
            <div>
              <label className="label mb-1.5 block">Type</label>
              <div className="flex rounded-md border border-border overflow-hidden text-sm font-medium">
                {(["FIRM", "INDIVIDUAL"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`flex-1 py-2 transition-colors ${form.type === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
                  >
                    {t === "FIRM" ? "Firm / Company" : "Individual"}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Name *">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={form.type === "FIRM" ? "Company name" : "Full name"} required />
            </Field>

            <Field label="Category *">
              <select
                required
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select a category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>

            {form.type === "FIRM" ? (
              <Field label="Website">
                <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://..." type="url" />
              </Field>
            ) : (
              <Field label="LinkedIn">
                <Input value={form.linkedin} onChange={(e) => setForm((f) => ({ ...f, linkedin: e.target.value }))} placeholder="https://linkedin.com/in/..." type="url" />
              </Field>
            )}

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What do they do? Who is it for?"
                rows={3}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Country">
                <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="e.g. Kenya" />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="e.g. Nairobi" />
              </Field>
            </div>

            <Field label="Contact email">
              <Input value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="contact@..." type="email" />
            </Field>

            <Field label="Your experience with them *">
              <textarea
                required
                value={form.endorsementNote}
                onChange={(e) => setForm((f) => ({ ...f, endorsementNote: e.target.value }))}
                placeholder="How did you use them? What was the outcome? Would you recommend them?"
                rows={3}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">This becomes your endorsement, shown alongside the listing.</p>
            </Field>

            {submitError && <p className="text-sm text-laterite">{submitError}</p>}

            <p className="text-xs text-muted-foreground">
              New submissions appear in the community tier and are marked Vetted once reviewed by the {ORG_NAME} team.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowSubmit(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Submitting..." : "Submit Provider"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Endorse modal */}
      {endorseTarget && (
        <Modal
          title={endorseTarget.userEndorsement ? "Update your endorsement" : "Endorse this provider"}
          onClose={() => { setEndorseTarget(null); setEndorseNote(""); }}
        >
          <p className="mb-4 text-sm text-muted-foreground">
            <strong className="text-foreground">{endorseTarget.name}</strong>
          </p>
          <form onSubmit={handleEndorse} className="space-y-4">
            <Field label="Your experience *">
              <textarea
                required
                autoFocus
                value={endorseNote}
                onChange={(e) => setEndorseNote(e.target.value)}
                placeholder="How did you use them? What was the outcome?"
                rows={4}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </Field>
            {endorseError && <p className="text-sm text-laterite">{endorseError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => { setEndorseTarget(null); setEndorseNote(""); }}>Cancel</Button>
              <Button type="submit" disabled={endorsing}>{endorsing ? "Saving..." : "Save Endorsement"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}

// ─── Provider Card ─────────────────────────────────────────

function ProviderCard({
  provider: p,
  currentUserId,
  expanded,
  onToggleExpand,
  onEndorse,
  onRemoveEndorsement,
}: {
  provider: Provider;
  currentUserId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onEndorse: () => void;
  onRemoveEndorsement: () => void;
}) {
  const hasEndorsed = !!p.userEndorsement;

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-col flex-1 p-5">
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
              {p.type === "FIRM" ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.category.name}</p>
            </div>
          </div>
          <StatusBadge status={p.status} />
        </div>

        {/* Location */}
        {(p.city || p.country) && (
          <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{[p.city, p.country].filter(Boolean).join(", ")}</span>
          </div>
        )}

        {/* Description */}
        {p.description && (
          <p className="mb-3 text-sm text-muted-foreground line-clamp-3 flex-1">{p.description}</p>
        )}

        {/* Links */}
        <div className="mb-3 flex flex-wrap gap-2">
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
          {p.contactEmail && (
            <a href={`mailto:${p.contactEmail}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <Mail className="h-3 w-3" /> Email
            </a>
          )}
        </div>

        {/* Endorsements bar */}
        <div className="mt-auto border-t border-border pt-3 flex items-center justify-between gap-2">
          <button
            onClick={onToggleExpand}
            disabled={p.endorsementCount === 0}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:pointer-events-none"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>{p.endorsementCount} endorsement{p.endorsementCount !== 1 ? "s" : ""}</span>
            {p.endorsementCount > 0 && <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />}
          </button>
          {hasEndorsed ? (
            <div className="flex items-center gap-2">
              <button onClick={onEndorse} className="text-xs text-muted-foreground hover:text-foreground underline">Edit</button>
              <button onClick={onRemoveEndorsement} className="text-xs text-laterite hover:text-laterite underline">Remove</button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={onEndorse}>
              <ThumbsUp className="h-3.5 w-3.5" />
              Endorse
            </Button>
          )}
        </div>

        {/* Expanded endorsements */}
        {expanded && p.endorsements.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            {p.endorsements.map((e) => (
              <div key={e.id} className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-xs font-medium text-foreground">{e.user.name ?? "Founder"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{e.note}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ───────────────────────────────────────────────

function StatusBadge({ status }: { status: Provider["status"] }) {
  if (status === "VETTED") {
    return (
      <span className="badge-success shrink-0">
        <CheckCircle2 className="h-3 w-3" /> Vetted
      </span>
    );
  }
  return (
    <span className="badge-warning shrink-0">
      <Clock className="h-3 w-3" /> Community
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
