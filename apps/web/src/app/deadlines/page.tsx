'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DeadlineGroupDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { OpportunityCard, OpportunityCardSkeleton } from '@/components/OpportunityCard';
import { Button, Card, EmptyState, ErrorState } from '@/components/ui';
import { useAuth } from '@/components/AuthProvider';

export default function DeadlinesPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<DeadlineGroupDto[] | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setGroups(null);
    api.opportunities
      .deadlines(savedOnly)
      .then(setGroups)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load deadlines.'));
  }, [savedOnly]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Deadlines</h1>
          <p className="mt-1 text-sm text-muted">Everything closing in the next 30 days, tightest first.</p>
        </div>
        {user && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-[rgb(var(--brand))]"
              checked={savedOnly}
              onChange={(e) => setSavedOnly(e.target.checked)}
            />
            Only saved &amp; tracked
          </label>
        )}
      </header>

      {error ? (
        <ErrorState message={error} />
      ) : !groups ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <OpportunityCardSkeleton key={i} />)}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon="🗓️"
            title="Nothing closing soon"
            description={savedOnly ? 'None of your saved opportunities close in the next 30 days.' : 'No opportunities have a deadline in the next 30 days.'}
            action={<Link href="/opportunities"><Button size="sm">Browse opportunities</Button></Link>}
          />
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.bucket}>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              {group.bucket === 'TODAY' || group.bucket === 'TOMORROW' ? '🔥' : '🗓️'} {group.label}
              <span className="text-sm font-normal text-subtle">({group.items.length})</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((opportunity) => (
                <OpportunityCard key={opportunity.id} opportunity={opportunity} compact />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
