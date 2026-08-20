'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { OpportunityFilters, OpportunitySearchResponse } from '@odp/shared';
import { api, ApiError, type TaxonomyResponse } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from './AuthProvider';
import { OpportunityCard, OpportunityCardSkeleton } from './OpportunityCard';
import { Badge, Button, EmptyState, ErrorState } from './ui';

/**
 * The search + filter surface (requirements 14, 15).
 *
 * Filter state lives in the URL, so a filtered view is shareable, bookmarkable
 * and survives a refresh.
 */

type FilterKey =
  | 'types' | 'industries' | 'domains' | 'workModes' | 'cities' | 'degrees'
  | 'experienceBands' | 'companyTypes' | 'skills' | 'governmentCategories'
  | 'psuCategories' | 'internshipCategories';

interface Props {
  /** Restricts the browser to a dedicated module endpoint. */
  module?: 'internships' | 'government' | 'psu' | 'freshers';
  title: string;
  description?: string;
  /** Filters forced on every query and hidden from the UI. */
  lockedFilters?: Partial<OpportunityFilters>;
  /** Facet groups to hide (e.g. type filter on a type-specific page). */
  hiddenFacets?: FilterKey[];
}

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'match', label: 'Best match' },
  { value: 'deadline', label: 'Closing soonest' },
  { value: 'newest', label: 'Newest first' },
  { value: 'salary', label: 'Highest salary' },
];

const DEADLINE_OPTIONS = [
  { value: '0', label: 'Today' },
  { value: '3', label: 'Next 3 days' },
  { value: '7', label: 'This week' },
  { value: '30', label: 'This month' },
];

export function OpportunityBrowser({ module, title, description, lockedFilters, hiddenFacets = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [data, setData] = useState<OpportunitySearchResponse | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [queryDraft, setQueryDraft] = useState(searchParams.get('q') ?? '');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Reads the current filter state straight out of the URL. */
  const filters = useMemo((): Partial<OpportunityFilters> & Record<string, unknown> => {
    const get = (key: string): string[] | undefined => {
      const value = searchParams.get(key);
      return value ? value.split(',').filter(Boolean) : undefined;
    };
    const num = (key: string): number | undefined => {
      const value = searchParams.get(key);
      return value ? Number(value) : undefined;
    };

    return {
      q: searchParams.get('q') ?? undefined,
      types: get('types') as never,
      industries: get('industries'),
      domains: get('domains'),
      skills: get('skills'),
      workModes: get('workModes') as never,
      cities: get('cities'),
      degrees: get('degrees') as never,
      experienceBands: get('experienceBands'),
      companyTypes: get('companyTypes') as never,
      governmentCategories: get('governmentCategories'),
      psuCategories: get('psuCategories'),
      internshipCategories: get('internshipCategories'),
      deadlineWithinDays: num('deadlineWithinDays'),
      minSalary: num('minSalary'),
      eligibleOnly: searchParams.get('eligibleOnly') === 'true' || undefined,
      sort: (searchParams.get('sort') as OpportunityFilters['sort']) ?? undefined,
      page: num('page') ?? 1,
      pageSize: 20,
    };
  }, [searchParams]);

  useEffect(() => {
    api.taxonomy.get().then(setTaxonomy).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    const request = { ...filters, ...lockedFilters };
    const promise = module
      ? api.opportunities.module(module, request)
      : api.opportunities.search(request);

    promise
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load opportunities.'))
      .finally(() => setLoading(false));
    // `lockedFilters` is a literal from the parent; depending on it by identity
    // would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, module]);

  useEffect(load, [load]);

  /** Writes a filter change back to the URL, resetting pagination. */
  const setParam = useCallback(
    (key: string, value: string | string[] | undefined) => {
      const next = new URLSearchParams(searchParams.toString());
      const serialised = Array.isArray(value) ? value.join(',') : value;
      if (!serialised) next.delete(key);
      else next.set(key, serialised);
      if (key !== 'page') next.delete('page');
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const toggleValue = useCallback(
    (key: string, value: string) => {
      const current = (searchParams.get(key) ?? '').split(',').filter(Boolean);
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      setParam(key, next.length ? next : undefined);
    },
    [searchParams, setParam],
  );

  // Debounce free-text so each keystroke does not hit the API.
  const onQueryChange = (value: string): void => {
    setQueryDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam('q', value || undefined), 400);
  };

  const activeFilterCount = useMemo(
    () =>
      [...searchParams.keys()].filter(
        (key) => !['q', 'page', 'sort'].includes(key) && searchParams.get(key),
      ).length,
    [searchParams],
  );

  const clearAll = (): void => {
    const next = new URLSearchParams();
    const q = searchParams.get('q');
    if (q) next.set('q', q);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const facets = data?.facets;
  const showFacet = (key: FilterKey): boolean => !hiddenFacets.includes(key);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            className="input pl-9"
            placeholder="Try: data analyst internship remote, or government jobs for BTech CSE 2026"
            value={queryDraft}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search opportunities"
            type="search"
          />
        </div>

        <select
          className="input sm:w-48"
          value={filters.sort ?? 'relevance'}
          onChange={(e) => setParam('sort', e.target.value)}
          aria-label="Sort results"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} disabled={option.value === 'match' && !user}>
              {option.label}
              {option.value === 'match' && !user ? ' (sign in)' : ''}
            </option>
          ))}
        </select>

        <Button variant="outline" onClick={() => setShowFilters((open) => !open)} className="lg:hidden">
          Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </Button>
      </div>

      {/* What the natural-language parser understood, so search never feels opaque. */}
      {data?.interpretation && filters.q && (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info">{data.interpretation}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[248px_1fr]">
        <aside className={cn('space-y-4', showFilters ? 'block' : 'hidden lg:block')}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Filters</h2>
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearAll} className="text-xs text-brand hover:underline">
                Clear all
              </button>
            )}
          </div>

          {user && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-success-soft/50 p-2.5 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-[rgb(var(--success))]"
                checked={Boolean(filters.eligibleOnly)}
                onChange={(e) => setParam('eligibleOnly', e.target.checked ? 'true' : undefined)}
              />
              <span className="font-medium">Only what I am eligible for</span>
            </label>
          )}

          <FilterGroup title="Deadline">
            <div className="flex flex-wrap gap-1.5">
              {DEADLINE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setParam(
                      'deadlineWithinDays',
                      String(filters.deadlineWithinDays) === option.value ? undefined : option.value,
                    )
                  }
                  className={cn(
                    'rounded-md px-2 py-1 text-xs transition-colors',
                    String(filters.deadlineWithinDays) === option.value
                      ? 'bg-brand text-brand-fg'
                      : 'bg-surface-2 text-muted hover:text-fg',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </FilterGroup>

          {showFacet('types') && facets?.types.length ? (
            <FacetGroup
              title="Opportunity type"
              buckets={facets.types}
              selected={filters.types as string[] | undefined}
              onToggle={(value) => toggleValue('types', value)}
            />
          ) : null}

          {showFacet('workModes') && facets?.workModes.length ? (
            <FacetGroup
              title="Work mode"
              buckets={facets.workModes.filter((b) => b.value !== 'NOT_SPECIFIED')}
              selected={filters.workModes as string[] | undefined}
              onToggle={(value) => toggleValue('workModes', value)}
              formatLabel={(v) => (v === 'REMOTE' ? 'Remote' : v === 'HYBRID' ? 'Hybrid' : 'On-site')}
            />
          ) : null}

          <FilterGroup title="Experience">
            <div className="space-y-1">
              {(taxonomy?.experienceBands ?? []).map((band) => (
                <CheckRow
                  key={band.id}
                  label={band.label}
                  checked={(filters.experienceBands ?? []).includes(band.id)}
                  onChange={() => toggleValue('experienceBands', band.id)}
                />
              ))}
            </div>
          </FilterGroup>

          {showFacet('cities') && facets?.cities.length ? (
            <FacetGroup
              title="Location"
              buckets={facets.cities.slice(0, 10)}
              selected={filters.cities}
              onToggle={(value) => toggleValue('cities', value)}
            />
          ) : null}

          {showFacet('industries') && facets?.industries.length ? (
            <FacetGroup
              title="Industry"
              buckets={facets.industries.slice(0, 12)}
              selected={filters.industries}
              onToggle={(value) => toggleValue('industries', value)}
            />
          ) : null}

          {showFacet('domains') && facets?.domains.length ? (
            <FacetGroup
              title="Domain"
              buckets={facets.domains.slice(0, 12)}
              selected={filters.domains}
              onToggle={(value) => toggleValue('domains', value)}
            />
          ) : null}

          <FilterGroup title="Education">
            <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
              {(taxonomy?.degrees ?? []).map((degree) => (
                <CheckRow
                  key={degree.value}
                  label={degree.label}
                  checked={(filters.degrees as string[] | undefined ?? []).includes(degree.value)}
                  onChange={() => toggleValue('degrees', degree.value)}
                />
              ))}
            </div>
          </FilterGroup>

          {showFacet('skills') && facets?.skills.length ? (
            <FacetGroup
              title="Skills"
              buckets={facets.skills.slice(0, 12)}
              selected={filters.skills}
              onToggle={(value) => toggleValue('skills', value)}
            />
          ) : null}

          {showFacet('companyTypes') && facets?.companyTypes.length ? (
            <FacetGroup
              title="Company type"
              buckets={facets.companyTypes}
              selected={filters.companyTypes as string[] | undefined}
              onToggle={(value) => toggleValue('companyTypes', value)}
              formatLabel={(v) => v.replace(/_/g, ' ').toLowerCase()}
            />
          ) : null}
        </aside>

        {/* min-w-0: a grid child defaults to min-width:auto and refuses to
            shrink below its content, which pushed long titles and URLs past
            the viewport on narrow screens. */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted" aria-live="polite">
              {loading ? 'Searching…' : `${data?.total.toLocaleString('en-IN') ?? 0} opportunities`}
            </p>
            {activeFilterCount > 0 && <Badge tone="brand">{activeFilterCount} filters</Badge>}
          </div>

          {error ? (
            <ErrorState message={error} retry={load} />
          ) : loading ? (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <OpportunityCardSkeleton key={i} />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="🔍"
                title="No opportunities match these filters"
                description="Try removing a filter, widening the location, or including remote roles."
                action={
                  activeFilterCount > 0 ? (
                    <Button size="sm" variant="outline" onClick={clearAll}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {data.items.map((opportunity) => (
                  <OpportunityCard key={opportunity.id} opportunity={opportunity} />
                ))}
              </div>

              {data.totalPages > 1 && (
                <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page <= 1}
                    onClick={() => setParam('page', String(data.page - 1))}
                  >
                    Previous
                  </Button>
                  <span className="px-2 text-sm tabular-nums text-muted">
                    Page {data.page} of {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page >= data.totalPages}
                    onClick={() => setParam('page', String(data.page + 1))}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      {children}
    </div>
  );
}

function FacetGroup({
  title,
  buckets,
  selected,
  onToggle,
  formatLabel,
}: {
  title: string;
  buckets: { value: string; label: string; count: number }[];
  selected?: string[];
  onToggle: (value: string) => void;
  formatLabel?: (value: string) => string;
}) {
  return (
    <FilterGroup title={title}>
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {buckets.map((bucket) => (
          <CheckRow
            key={bucket.value}
            label={formatLabel ? formatLabel(bucket.value) : bucket.label}
            count={bucket.count}
            checked={(selected ?? []).includes(bucket.value)}
            onChange={() => onToggle(bucket.value)}
          />
        ))}
      </div>
    </FilterGroup>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface-2">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded border-border accent-[rgb(var(--brand))]"
        checked={checked}
        onChange={onChange}
      />
      <span className={cn('min-w-0 flex-1 truncate capitalize', checked ? 'font-medium text-fg' : 'text-muted')}>
        {label}
      </span>
      {count !== undefined && <span className="shrink-0 text-xs tabular-nums text-subtle">{count}</span>}
    </label>
  );
}
