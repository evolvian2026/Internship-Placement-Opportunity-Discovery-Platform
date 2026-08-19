'use client';

import { useEffect, useState } from 'react';
import type { CareerReadinessDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Card, CardHeader, ErrorState, Meter, Skeleton } from '@/components/ui';

export default function ReadinessPage() {
  return (
    <RequireAuth>
      <Readiness />
    </RequireAuth>
  );
}

function Readiness() {
  const [data, setData] = useState<CareerReadinessDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    api.dashboard
      .readiness()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your readiness score.'));
  };

  useEffect(load, []);

  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-72" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Career readiness</h1>
        <p className="mt-1 text-sm text-muted">
          Every component is shown with its weight and exactly what would raise it.
        </p>
      </header>

      <Card className="p-6 text-center">
        <p className="text-5xl font-bold tabular-nums">{data.overall}</p>
        <p className="mt-1 text-sm text-subtle">out of 100</p>
        <div className="mx-auto mt-4 max-w-sm">
          <Meter value={data.overall} showValue={false} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Breakdown" description="Weights are configurable by the platform, not hidden" />
        <ul className="divide-y divide-border">
          {data.breakdown.map((item) => (
            <li key={item.key} className="p-4">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-xs text-subtle">weight {Math.round(item.weight * 100)}%</span>
              </div>
              <Meter value={item.score} showValue />
              <p className="mt-1.5 text-xs text-muted">{item.hint}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
