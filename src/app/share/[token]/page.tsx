"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Building2,
  Globe,
  MapPin,
  AlertCircle,
  Mail,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatPeriod } from "@/lib/utils";

interface MetricSnapshot {
  name: string;
  unit: string | null;
  value: number;
  date: string;
}

interface Company {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  geography: string | null;
  fundingStage: string | null;
  website: string | null;
  metrics: MetricSnapshot[];
}

interface UpdateItem {
  id: string;
  companyId: string;
  title: string;
  period: string;
  body: string;
  sentAt: string | null;
  createdAt: string;
  company: { id: string; name: string };
  metricValues: {
    id: string;
    value: number;
    date: string;
    metricDefinition: { name: string; unit: string | null };
  }[];
}

interface ShareData {
  id: string;
  label: string | null;
  periodStart: string;
  periodEnd: string;
  expiresAt: string | null;
  companies: Company[];
  updates: UpdateItem[];
}

const STORAGE_PREFIX = "share_viewer_";

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Email gate
  const [emailGate, setEmailGate] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [submittingEmail, setSubmittingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Expanded updates
  const [expandedUpdates, setExpandedUpdates] = useState<Set<string>>(new Set());

  const recordedRef = useRef(false);

  useEffect(() => {
    async function init() {
      // Load data first
      try {
        const res = await fetch(`/api/share/${token}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          setError(errData?.error ?? "This link is invalid or has expired.");
          return;
        }
        const shareData = await res.json();
        setData(shareData);

        // Check localStorage for stored email
        const stored = localStorage.getItem(`${STORAGE_PREFIX}${token}`);
        if (stored) {
          // Already identified — log silently
          if (!recordedRef.current) {
            recordedRef.current = true;
            fetch(`/api/share/${token}/view`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: stored }),
            }).catch(() => {});
          }
        } else {
          // Show email gate
          setEmailGate(true);
        }
      } catch {
        setError("Failed to load this link.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [token]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailInput.trim() || !emailInput.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setSubmittingEmail(true);
    setEmailError(null);

    try {
      const res = await fetch(`/api/share/${token}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Something went wrong");
      }
      localStorage.setItem(`${STORAGE_PREFIX}${token}`, emailInput.trim().toLowerCase());
      setEmailGate(false);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmittingEmail(false);
    }
  }

  function toggleUpdate(id: string) {
    setExpandedUpdates((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <AlertCircle className="mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Link unavailable</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Email gate modal */}
      {emailGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-xl">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
              <Mail className="h-5 w-5 text-primary-700" />
            </div>
            <h2 className="text-lg font-semibold">Enter your email to continue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your email helps the sender know who viewed this update.
            </p>
            <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3">
              <Input
                id="email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                error={emailError ?? undefined}
              />
              <Button type="submit" className="w-full" disabled={submittingEmail}>
                {submittingEmail ? "..." : "View Update"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Page content */}
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <img src="/logo.png" alt="Molly" className="h-5" />
            <span>DFS Lab Portfolio Update</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold">
            {data!.label || "Portfolio Update"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(data!.periodStart).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            {" – "}
            {new Date(data!.periodEnd).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Portfolio snapshot strip */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Portfolio Companies
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data!.companies.map((company) => (
              <Card key={company.id}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight">{company.name}</p>
                      {company.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {company.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {company.sector && <Badge variant="neutral" className="text-xs">{company.sector}</Badge>}
                        {company.fundingStage && <Badge variant="info" className="text-xs">{company.fundingStage}</Badge>}
                        {company.geography && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />{company.geography}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Latest metrics */}
                  {company.metrics.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3 border-t pt-3">
                      {company.metrics.map((m) => (
                        <div key={m.name}>
                          <p className="text-xs text-muted-foreground">{m.name}</p>
                          <p className="text-sm font-semibold">
                            {Number(m.value).toLocaleString()}
                            {m.unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{m.unit}</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Combined updates feed */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Updates ({data!.updates.length})
          </h2>

          {data!.updates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No published updates in this period.
            </div>
          ) : (
            <div className="space-y-3">
              {data!.updates.map((update) => {
                const isExpanded = expandedUpdates.has(update.id);
                const date = update.sentAt ?? update.createdAt;
                return (
                  <Card key={update.id}>
                    <CardContent className="py-0">
                      {/* Update header — always visible */}
                      <button
                        onClick={() => toggleUpdate(update.id)}
                        className="flex w-full items-center justify-between py-4 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            <Badge variant="neutral" className="text-xs">{update.company.name}</Badge>
                          </div>
                          <p className="mt-0.5 font-semibold">{update.title}</p>
                          <p className="text-xs text-muted-foreground">{formatPeriod(update.period)}</p>
                        </div>
                        <div className="ml-4 shrink-0 text-muted-foreground">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t pb-5 pt-4">
                          {/* Metric values snapshot for this update */}
                          {update.metricValues.length > 0 && (
                            <div className="mb-4 flex flex-wrap gap-4">
                              {update.metricValues.map((mv) => (
                                <div key={mv.id}>
                                  <p className="text-xs text-muted-foreground">{mv.metricDefinition.name}</p>
                                  <p className="text-base font-semibold">
                                    {Number(mv.value).toLocaleString()}
                                    {mv.metricDefinition.unit && (
                                      <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                                        {mv.metricDefinition.unit}
                                      </span>
                                    )}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}

                          <div
                            className="prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: update.body }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="mt-10 border-t pt-6 text-center text-xs text-muted-foreground">
          <p>Shared via Molly · DFS Lab portfolio management platform</p>
          {data!.expiresAt && (
            <p className="mt-1">
              This link expires {new Date(data!.expiresAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
