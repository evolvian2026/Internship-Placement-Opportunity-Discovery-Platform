'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { COMPANY_TYPES } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { avatarColor, cn, initials } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  industry: string | null;
  companyType: string | null;
  headquarters: string | null;
  employeeCount: string | null;
  openOpportunities: number;
  followerCount: number;
  isFollowed?: boolean;
}

export default function CompaniesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setRows(null);
      api.companies
        .list({ q: query || undefined, companyTypes: type || undefined, hiringOnly: true, pageSize: 48 })
        .then((res) => setRows(res.items as unknown as CompanyRow[]))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load companies.'));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, type]);

  const toggleFollow = async (company: CompanyRow): Promise<void> => {
    const next = !company.isFollowed;
    setRows((current) => current?.map((c) => (c.id === company.id ? { ...c, isFollowed: next } : c)) ?? null);
    try {
      if (next) await api.companies.follow(company.id);
      else await api.companies.unfollow(company.id);
    } catch {
      setRows((current) => current?.map((c) => (c.id === company.id ? { ...c, isFollowed: !next } : c)) ?? null);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Company directory</h1>
        <p className="mt-1 text-sm text-muted">
          Follow a company and you get an alert the moment it posts something new.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          placeholder="Search companies"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          aria-label="Search companies"
        />
        <select className="input sm:w-52" value={type} onChange={(e) => setType(e.target.value)} aria-label="Company type">
          <option value="">All company types</option>
          {COMPANY_TYPES.map((companyType) => (
            <option key={companyType} value={companyType}>
              {companyType.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : !rows ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon="🏢" title="No companies match" description="Try a different search or clear the filter." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((company) => (
            <Card key={company.id} className="flex items-start gap-3 p-4">
              {company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logoUrl} alt="" className="h-10 w-10 rounded-lg border border-border object-contain" />
              ) : (
                <div
                  className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold', avatarColor(company.name))}
                  aria-hidden="true"
                >
                  {initials(company.name)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <Link href={`/companies/${company.slug}`} className="truncate text-sm font-semibold hover:text-brand">
                  {company.name}
                </Link>
                <p className="truncate text-xs text-muted">
                  {[company.industry, company.headquarters].filter(Boolean).join(' · ') || 'Industry not specified'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {company.companyType && <Badge>{company.companyType.replace(/_/g, ' ').toLowerCase()}</Badge>}
                  <Badge tone="brand">{company.openOpportunities} open</Badge>
                </div>
              </div>

              {user && (
                <Button
                  size="sm"
                  variant={company.isFollowed ? 'secondary' : 'outline'}
                  onClick={() => void toggleFollow(company)}
                >
                  {company.isFollowed ? 'Following' : 'Follow'}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
