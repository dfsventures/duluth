"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useSession } from "next-auth/react";

export interface Company {
  id: string;
  name: string;
  logo: string | null;
  sector: string | null;
  geography: string | null;
  fundingStage: string | null;
  description: string | null;
  membershipRole?: string;
  // Part 16, WS40 — "DILIGENCE" | "ACTIVE". GET /api/companies already
  // spreads every Company field, so this is a type-only addition.
  stage?: string;
}

interface CompanyContextValue {
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompanyId: (id: string) => void;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextValue>({
  companies: [],
  selectedCompany: null,
  setSelectedCompanyId: () => {},
  loading: true,
});

const STORAGE_KEY = "molly_selected_company_id";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated") return;

    // Skip for pure admins — they don't use the founder company context
    const roles = (session?.user?.roles as string[] | undefined) ?? [];
    if (roles.includes("ADMIN") && !roles.includes("FOUNDER")) {
      setLoading(false);
      return;
    }

    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list: Company[] = data.data ?? data;
        setCompanies(list);

        const stored = localStorage.getItem(STORAGE_KEY);
        const valid = stored && list.some((c) => c.id === stored);
        setSelectedId(valid ? stored : (list[0]?.id ?? null));
      })
      .finally(() => setLoading(false));
  }, [status]);

  function setSelectedCompanyId(id: string) {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  const selectedCompany = companies.find((c) => c.id === selectedId) ?? companies[0] ?? null;

  return (
    <CompanyContext.Provider value={{ companies, selectedCompany, setSelectedCompanyId, loading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
