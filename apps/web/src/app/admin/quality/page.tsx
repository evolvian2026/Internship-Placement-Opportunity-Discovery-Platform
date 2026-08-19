'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { OpportunityDetailDto } from '@odp/shared';
import { api, ApiError, type DataQualityDto, type DuplicateGroup } from '@/lib/api';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Meter, Skeleton, StatTile } from '@/components/ui';

export default function DataQualityPage() {
  const [quality, setQuality] = useState<DataQualityDto | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[] | null>(null);
  const [flagged, setFlagged] = useState<OpportunityDetailDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    Promise.all([api.admin.dataQuality(), api.admin.duplicates(), api.admin.flagged()])
      .then(([q, d, f]) => {
        setQuality(q);
        setDuplicates(d);
        setFlagged(f);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load data quality.'));
  };

  useEffect(load, []);

  const merge = async (survivorId: string, duplicateId: string): Promise<void> => {
    await api.admin.mergeDuplicate(survivorId, duplicateId);
    load();
  };

  if (error) return <ErrorState message={error} retry={load} />;
  if (!quality || !duplicates || !flagged) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Flagged for review" value={quality.review.flagged} tone={quality.review.flagged > 0 ? 'danger' : 'success'} />
        <StatTile label="Unverified" value={quality.review.unverified} tone={quality.review.unverified > 0 ? 'warning' : 'success'} />
        <StatTile label="Merged duplicates" value={quality.review.duplicates} />
      </section>

      <Card>
        <CardHeader
          title="Completeness"
          description={`Across ${quality.total.toLocaleString('en-IN')} live opportunities — lower is better`}
        />
        <ul className="space-y-3 p-4">
          {quality.issues.map((issue) => (
            <li key={issue.key}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted">{issue.label}</span>
                <span className="tabular-nums">
                  {issue.count.toLocaleString('en-IN')} <span className="text-subtle">({issue.percent}%)</span>
                </span>
              </div>
              <Meter
                value={issue.percent}
                showValue={false}
                tone={issue.percent > 40 ? 'danger' : issue.percent > 15 ? 'warning' : 'success'}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Duplicate candidates"
          description="Same organisation, title and location — merge keeps every source reference"
        />
        {duplicates.length === 0 ? (
          <EmptyState title="No duplicate candidates" description="Detection runs on every ingestion pass." />
        ) : (
          <ul className="divide-y divide-border">
            {duplicates.map((group) => (
              <li key={group.dedupeHash} className="p-4">
                <p className="mb-2 text-sm font-medium">
                  {group.items[0]?.title} · {group.count} copies
                </p>
                <ul className="space-y-2">
                  {group.items.map((item, index) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2.5 text-xs">
                      <Link href={`/opportunities/${item.id}`} className="font-medium hover:text-brand">
                        {item.organizationName}
                      </Link>
                      <span className="text-subtle">{item.sources.join(', ')}</span>
                      <Badge>{item.status.toLowerCase()}</Badge>
                      {index > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() => void merge(group.items[0].id, item.id)}
                        >
                          Merge into first
                        </Button>
                      )}
                      {index === 0 && <Badge tone="success">Survivor</Badge>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Flagged for safety review"
          description="Automated cautions only — never a fraud determination"
        />
        {flagged.length === 0 ? (
          <EmptyState title="Nothing flagged" description="No live opportunity tripped the safety heuristics." />
        ) : (
          <ul className="divide-y divide-border">
            {flagged.map((opportunity) => (
              <li key={opportunity.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/opportunities/${opportunity.slug}`} className="text-sm font-medium hover:text-brand">
                    {opportunity.title}
                  </Link>
                  <p className="text-xs text-muted">{opportunity.organizationName}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {opportunity.fraudFlags.map((flag) => (
                      <Badge key={flag} tone="danger">{flag.replace(/_/g, ' ').toLowerCase()}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void api.admin.setStatus(opportunity.id, 'VERIFIED').then(load)}>
                    Mark verified
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void api.admin.setStatus(opportunity.id, 'REMOVED').then(load)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
