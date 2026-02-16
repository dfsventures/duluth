"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Building2,
  FileText,
  BarChart3,
  FolderOpen,
  Users,
  Globe,
  MapPin,
  Pencil,
  Plus,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Save,
  Upload,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, daysSince } from "@/lib/utils";

const SECTORS = [
  "Fintech",
  "Agritech",
  "Healthtech",
  "Logistics",
  "Education",
  "E-commerce",
  "Other",
];

const FUNDING_STAGES = ["Pre-seed", "Seed", "Series A", "Series B+"];

interface Company {
  id: string;
  name: string;
  logo: string | null;
  description: string | null;
  website: string | null;
  sector: string | null;
  geography: string | null;
  fundingStage: string | null;
}

interface Update {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  createdAt: string;
}

interface MetricDefinition {
  id: string;
  name: string;
  unit: string | null;
  values: { value: number; date: string }[];
}

interface Document {
  id: string;
  name: string;
  type: string | null;
  createdAt: string;
  uploadedBy: string | null;
}

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

type Tab = "updates" | "metrics" | "documents" | "members";

export default function AdminCompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("updates");

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadCompany = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      if (!res.ok) throw new Error("Failed to load company");
      const data = await res.json();
      const c = data.data ?? data;
      setCompany(c);
      setEditForm(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [companyId]);

  const loadUpdates = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/updates`);
      if (res.ok) {
        const data = await res.json();
        setUpdates(data.data ?? data ?? []);
      }
    } catch {
      // Silently fail for secondary data
    }
  }, [companyId]);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/metrics`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.data ?? data ?? []);
      }
    } catch {
      // Silently fail
    }
  }, [companyId]);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.data ?? data ?? []);
      }
    } catch {
      // Silently fail
    }
  }, [companyId]);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.data ?? data ?? []);
      }
    } catch {
      // Silently fail
    }
  }, [companyId]);

  useEffect(() => {
    async function fetchAll() {
      await loadCompany();
      await Promise.all([loadUpdates(), loadMetrics(), loadDocuments(), loadMembers()]);
      setLoading(false);
    }

    fetchAll();
  }, [loadCompany, loadUpdates, loadMetrics, loadDocuments, loadMembers]);

  function updateEditField(field: keyof Company, value: string | null) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSaveEdit() {
    if (!editForm) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          website: editForm.website,
          sector: editForm.sector,
          geography: editForm.geography,
          fundingStage: editForm.fundingStage,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to save");
      }

      setCompany(editForm);
      setEditing(false);
      setMessage({ type: "success", text: "Company profile updated." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  }

  function getTrend(values: { value: number; date: string }[]) {
    if (values.length < 2) return "flat";
    const sorted = [...values].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    if (sorted[0].value > sorted[1].value) return "up";
    if (sorted[0].value < sorted[1].value) return "down";
    return "flat";
  }

  function TrendIcon({ trend }: { trend: string }) {
    if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (error || !company) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">
            {error ?? "Company not found."}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => router.push("/admin/companies")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </div>
      </AppShell>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "updates", label: "Updates", icon: <FileText className="h-4 w-4" /> },
    { key: "metrics", label: "Metrics", icon: <BarChart3 className="h-4 w-4" /> },
    { key: "documents", label: "Documents", icon: <FolderOpen className="h-4 w-4" /> },
    { key: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <AppShell>
      <PageHeader
        title={company.name}
        description="Company detail view"
        action={
          <Button variant="ghost" onClick={() => router.push("/admin/companies")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        }
      />

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {message.text}
        </div>
      )}

      {/* Company profile summary */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="flex items-center gap-3">
              {company.logo ? (
                <img
                  src={company.logo}
                  alt={company.name}
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                  <Building2 className="h-5 w-5" />
                </div>
              )}
              {editing ? "Edit Company" : company.name}
            </CardTitle>
            {!editing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditForm(company);
                  setEditing(true);
                  setMessage(null);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing && editForm ? (
            <div className="space-y-4">
              <Input
                id="edit-name"
                label="Company Name"
                value={editForm.name}
                onChange={(e) => updateEditField("name", e.target.value)}
                required
              />
              <Textarea
                id="edit-description"
                label="Description"
                value={editForm.description ?? ""}
                onChange={(e) => updateEditField("description", e.target.value)}
                rows={3}
              />
              <Input
                id="edit-website"
                label="Website"
                type="url"
                value={editForm.website ?? ""}
                onChange={(e) => updateEditField("website", e.target.value)}
              />
              <div className="space-y-1">
                <label htmlFor="edit-sector" className="label">
                  Sector
                </label>
                <select
                  id="edit-sector"
                  value={editForm.sector ?? ""}
                  onChange={(e) => updateEditField("sector", e.target.value)}
                  className="input-field"
                >
                  <option value="">Select a sector</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                id="edit-geography"
                label="Geography"
                value={editForm.geography ?? ""}
                onChange={(e) => updateEditField("geography", e.target.value)}
              />
              <div className="space-y-1">
                <label htmlFor="edit-fundingStage" className="label">
                  Funding Stage
                </label>
                <select
                  id="edit-fundingStage"
                  value={editForm.fundingStage ?? ""}
                  onChange={(e) => updateEditField("fundingStage", e.target.value)}
                  className="input-field"
                >
                  <option value="">Select a stage</option>
                  {FUNDING_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 border-t pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setEditForm(company);
                    setMessage(null);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" disabled={saving} onClick={handleSaveEdit}>
                  <Save className="mr-2 h-3.5 w-3.5" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {company.description && (
                <p className="text-sm text-muted-foreground">{company.description}</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                {company.sector && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="neutral">{company.sector}</Badge>
                  </div>
                )}
                {company.geography && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {company.geography}
                  </div>
                )}
                {company.fundingStage && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="info">{company.fundingStage}</Badge>
                  </div>
                )}
                {company.website && (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "updates" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Updates</h3>
            <Button
              size="sm"
              onClick={() =>
                router.push(`/admin/companies/${companyId}/updates/new`)
              }
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create Update
            </Button>
          </div>
          {updates.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No updates yet"
              description="No updates have been submitted for this company."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    router.push(`/admin/companies/${companyId}/updates/new`)
                  }
                >
                  Create Update
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {updates.map((update) => (
                <Link
                  key={update.id}
                  href={`/updates/${update.id}`}
                  className="block"
                >
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{update.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {update.period} &middot; {formatDate(update.createdAt)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          update.status === "SENT" ? "success" : "warning"
                        }
                      >
                        {update.status === "SENT" ? "Sent" : "Draft"}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "metrics" && (
        <div>
          <h3 className="mb-4 font-semibold">Metrics</h3>
          {metrics.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="h-8 w-8" />}
              title="No metrics defined"
              description="No metric definitions have been set up for this company."
            />
          ) : (
            <div className="space-y-4">
              {metrics.map((metric) => {
                const sortedValues = [...(metric.values ?? [])].sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                );
                const latestValue =
                  sortedValues.length > 0 ? sortedValues[0] : null;
                const trend = getTrend(metric.values ?? []);

                return (
                  <Card key={metric.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {metric.name}
                          {metric.unit && (
                            <span className="ml-1 text-sm font-normal text-muted-foreground">
                              ({metric.unit})
                            </span>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {latestValue && (
                            <span className="text-lg font-semibold">
                              {latestValue.value}
                            </span>
                          )}
                          <TrendIcon trend={trend} />
                        </div>
                      </div>
                    </CardHeader>
                    {sortedValues.length > 0 && (
                      <CardContent>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-2 font-medium">Date</th>
                              <th className="pb-2 text-right font-medium">
                                Value
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedValues.map((v, i) => (
                              <tr
                                key={i}
                                className="border-b last:border-0"
                              >
                                <td className="py-2">
                                  {formatDate(v.date)}
                                </td>
                                <td className="py-2 text-right font-medium">
                                  {v.value}
                                  {metric.unit ? ` ${metric.unit}` : ""}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "documents" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Documents</h3>
            <Button variant="secondary" size="sm" disabled>
              <Upload className="mr-2 h-3.5 w-3.5" />
              Upload Document
            </Button>
          </div>
          {documents.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-8 w-8" />}
              title="No documents"
              description="No documents have been uploaded for this company."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Uploaded By</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr
                        key={doc.id}
                        className="border-b last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {doc.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(doc.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {doc.uploadedBy ?? "Unknown"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="neutral">
                            {doc.type ?? "Unknown"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "members" && (
        <div>
          <h3 className="mb-4 font-semibold">Members</h3>
          {members.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No members"
              description="No users are associated with this company."
            />
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <Card key={member.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
                        {member.name?.[0]?.toUpperCase() ??
                          member.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">
                          {member.name ?? member.email}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={member.role === "ADMIN" ? "info" : "neutral"}
                    >
                      {member.role === "ADMIN" ? "Admin" : "Founder"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
