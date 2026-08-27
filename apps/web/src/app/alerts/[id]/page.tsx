'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { OpportunitySearchResponse } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { OpportunityCard, OpportunityCardSkeleton } from '@/components/OpportunityCard';
import { Button, Card, EmptyState, ErrorState } from '@/components/ui';

export default function AlertResultsPage() {
  return (
    <RequireAuth>
      <AlertResults />
    </RequireAuth>
  );
}

/** The live results behind one saved search. */
function AlertResults() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<OpportunitySearchResponse | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api.savedSearches
      .results(params.id, page)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not run this saved search.'));
  }, [params.id, page]);

  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-muted">
        <Link href="/alerts" className="hover:text-brand">Alerts</Link>
        <span className="mx-1.5">/</span>
        <span className="text-fg">Results</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold">Saved search results</h1>
        {data && (
          <p className="mt-1 text-sm text-muted">
            {data.total.toLocaleString('en-IN')} matching {data.total === 1 ? 'opportunity' : 'opportunities'}
          </p>
        )}
      </header>

      {!data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <OpportunityCardSkeleton key={i} />)}
        </div>
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing matches right now"
            description="You will still be alerted the moment something new does."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>

          {data.totalPages > 1 && (
            <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="px-2 text-sm tabular-nums text-muted">
                Page {data.page} of {data.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
