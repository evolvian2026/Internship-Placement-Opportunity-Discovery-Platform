'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SkillGapDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Badge, Button, Card, CardHeader, ErrorState, Meter, Skeleton } from '@/components/ui';

export default function SkillsPage() {
  return (
    <RequireAuth>
      <SkillGap />
    </RequireAuth>
  );
}

function SkillGap() {
  const [gap, setGap] = useState<SkillGapDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    api.dashboard
      .skillGap()
      .then(setGap)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not run the analysis.'));
  };

  useEffect(load, []);

  if (error) return <ErrorState message={error} retry={load} />;
  if (!gap) return <div className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Skill gap analysis</h1>
        <p className="mt-1 text-sm text-muted">
          Your skills measured against what the opportunities matching you actually ask for.
        </p>
      </header>

      <Card className="p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">Skills match</p>
          <span className="text-2xl font-bold tabular-nums">{gap.matchPercent}%</span>
        </div>
        <div className="mt-3">
          <Meter value={gap.matchPercent} showValue={false} />
        </div>
        <p className="mt-2 text-xs text-muted">
          Weighted by demand — a skill twenty postings want counts more than one that appears twice.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="You have" description={`${gap.haveSkills.length} in-demand skills`} />
          <div className="flex flex-wrap gap-1.5 p-4">
            {gap.haveSkills.map((skill) => (
              <Badge key={skill} tone="success">✓ {skill}</Badge>
            ))}
            {gap.haveSkills.length === 0 && (
              <p className="text-sm text-subtle">
                No skills recorded yet. <Link href="/profile" className="text-brand hover:underline">Add them</Link>.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Missing" description={`${gap.missingSkills.length} skills employers ask for`} />
          <div className="flex flex-wrap gap-1.5 p-4">
            {gap.missingSkills.map((skill) => (
              <Badge key={skill} tone="danger">✗ {skill}</Badge>
            ))}
            {gap.missingSkills.length === 0 && (
              <p className="text-sm text-success">You cover everything these opportunities list.</p>
            )}
          </div>
        </Card>
      </div>

      {gap.recommendedLearning.length > 0 && (
        <Card>
          <CardHeader title="Recommended learning" description="Ordered by how much each one unlocks" />
          <ol className="divide-y divide-border">
            {gap.recommendedLearning.map((item) => (
              <li key={item.skill} className="flex items-start gap-3 p-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                  {item.priority}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.skill}</p>
                  <p className="mt-0.5 text-xs text-muted">{item.reason}</p>
                </div>
                <Link href={`/opportunities?skills=${encodeURIComponent(item.skill)}`} className="ml-auto shrink-0">
                  <Button size="sm" variant="outline">See roles</Button>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
