'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { NearMissesDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { OpportunityCard } from '@/components/OpportunityCard';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui';

export default function NearMissesPage() {
  return (
    <RequireAuth>
      <NearMisses />
    </RequireAuth>
  );
}

/**
 * Feature 2 — "not eligible" is a dead end; "you miss this by 0.2 CGPA" is a
 * plan. Actionable groups come first; the rest are shown because knowing a
 * posting exists is still worth something.
 */
function NearMisses() {
  const [data, setData] = useState<NearMissesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    api.dashboard
      .nearMisses()
      .then((res) => {
        setData(res);
        setExpanded(res.groups[0]?.key ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not work out your near misses.'));
  };

  useEffect(load, []);

  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const actionable = data.groups.filter((g) => g.closable);
  const informational = data.groups.filter((g) => !g.closable);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Near misses</h1>
        <p className="mt-1 text-sm text-muted">
          Opportunities you do not currently qualify for — and exactly how far off you are. Of the{' '}
          {data.examinedCount} we checked, {data.ineligibleCount} were out of reach.
        </p>
      </header>

      {data.groups.length === 0 ? (
        <Card>
          <EmptyState
            icon="🎯"
            title="Nothing close enough to report"
            description="Either you qualify for what we found, or the gaps are too wide to be worth chasing. Widening your search usually surfaces more."
            action={
              <Link href="/opportunities">
                <Button size="sm">Browse opportunities</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {actionable.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
                Worth acting on
              </h2>
              {actionable.map((group) => (
                <GroupCard
                  key={group.key}
                  group={group}
                  open={expanded === group.key}
                  onToggle={() => setExpanded(expanded === group.key ? null : group.key)}
                />
              ))}
            </section>
          )}

          {informational.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
                Good to know
              </h2>
              {informational.map((group) => (
                <GroupCard
                  key={group.key}
                  group={group}
                  open={expanded === group.key}
                  onToggle={() => setExpanded(expanded === group.key ? null : group.key)}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function GroupCard({
  group,
  open,
  onToggle,
}: {
  group: NearMissesDto['groups'][number];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {group.title}
            <Badge tone={group.closable ? 'warning' : 'neutral'}>{group.items.length}</Badge>
          </span>
        }
        description={group.advice}
        action={
          <Button size="sm" variant="ghost" onClick={onToggle} aria-expanded={open}>
            {open ? 'Hide' : 'Show'}
          </Button>
        }
      />

      {open && (
        <div className="space-y-3 p-4">
          {group.items.map((item) => (
            <div key={item.opportunity.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                <span className="text-muted">Needs</span>
                <span className="font-semibold text-fg">{item.gap.required}</span>
                <span className="text-muted">· you have</span>
                <span className="font-semibold text-fg">{item.gap.actual}</span>
                {item.gap.shortfall != null && (
                  <Badge tone={group.closable ? 'warning' : 'neutral'}>
                    short by {item.gap.shortfall} {item.gap.unit ?? ''}
                  </Badge>
                )}
              </div>
              <OpportunityCard opportunity={item.opportunity} compact />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
