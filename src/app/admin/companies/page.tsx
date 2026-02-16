"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Users,
  Clock,
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

interface Company {
  id: string;
  name: string;
  sector: string | null;
  geography: string | null;
  fundingStage: string | null;
  memberCount: number;
  lastUpdate: string | null;
}

export default function AdminCompaniesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchCompanies() {
      try {
        const res = await fetch("/api/admin/companies");
        if (!res.ok) throw new Error("Failed to load companies");
        const data = await res.json();
        setCompanies(data.data ?? data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    fetchCompanies();
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </AppShell>
    );
  }

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <PageHeader
        title="Companies"
        description="Manage all portfolio companies."
        action={
          <Button onClick={() => router.push("/admin/companies/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Add Company
          </Button>
        }
      />

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder="Search by company name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {companies.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="No companies yet"
          description="Add your first portfolio company to get started."
          action={
            <Button onClick={() => router.push("/admin/companies/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </Button>
          }
        />
      ) : filteredCompanies.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="No results"
          description="No companies match your search. Try a different term."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map((company) => (
            <Link
              key={company.id}
              href={`/admin/companies/${company.id}`}
              className="block"
            >
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {company.name}
                  </CardTitle>
                  {company.sector && (
                    <CardDescription>
                      <Badge variant="neutral">{company.sector}</Badge>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {company.geography && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{company.geography}</span>
                      </div>
                    )}
                    {company.fundingStage && (
                      <div className="flex items-center gap-2">
                        <Badge variant="info">{company.fundingStage}</Badge>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        {company.memberCount} member{company.memberCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {company.lastUpdate
                          ? `Last update: ${formatDate(company.lastUpdate)}`
                          : "No updates yet"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
