'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { OpportunitySummaryDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { OpportunityCard, OpportunityCardSkeleton } from '@/components/OpportunityCard';
import { Button, Card, EmptyState, ErrorState } from '@/components/ui';

export default function SavedPage() {
  return (
    <RequireAuth>
      <Saved />
    </RequireAuth>
  );
}

function Saved() {
  const [items, setItems] = useState<OpportunitySummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    api.saved
      .list()
      .then((res) => setItems(res.items as OpportunitySummaryDto[]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your saved list.'));
  };

  useEffect(load, []);

  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Saved opportunities</h1>
        <p className="mt-1 text-sm text-muted">
          You get a deadline reminder for everything saved here.
        </p>
      </header>

      {!items ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <OpportunityCardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔖"
            title="Nothing saved yet"
            description="Tap the bookmark on any opportunity to keep it here and get a reminder before it closes."
            action={<Link href="/opportunities"><Button size="sm">Browse opportunities</Button></Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={{ ...opportunity, isSaved: true }}
              onSavedChange={(saved) => {
                if (!saved) setItems((current) => current?.filter((i) => i.id !== opportunity.id) ?? null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
