'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Company } from '@/types';

interface CompanyContextType {
  company: Company | null;
  companies: Company[];
  setCompany: (company: Company) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType>({
  company: null,
  companies: [],
  setCompany: () => {},
  loading: true,
  refetch: async () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompanyState] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: true });

    const list = data || [];
    setCompanies(list);

    // Restore from localStorage or pick first
    const savedId = localStorage.getItem('selectedCompanyId');
    const saved = list.find((c) => c.id === savedId);
    if (saved) {
      setCompanyState(saved);
    } else if (list.length > 0) {
      setCompanyState(list[0]);
      localStorage.setItem('selectedCompanyId', list[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const setCompany = (c: Company) => {
    setCompanyState(c);
    localStorage.setItem('selectedCompanyId', c.id);
  };

  return (
    <CompanyContext.Provider
      value={{ company, companies, setCompany, loading, refetch: fetchCompanies }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
