'use client';

import { useEffect, useState } from 'react';
import type { AdminAnalyticsDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { Card, CardHeader, ErrorState, Skeleton, StatTile } from '@/components/ui';
import { BarList, DonutChart } from '@/components/Charts';
import { StatusDot } from '@/components/StatusDot';
import { timeAgo } from '@/lib/utils';

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminAnalyticsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    api.admin
      .analytics()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load analytics.'));
  };

  useEffect(load, []);

  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Opportunities" value={data.totals.opportunities.toLocaleString('en-IN')} tone="brand" />
        <StatTile label="Live" value={data.totals.activeOpportunities.toLocaleString('en-IN')} tone="success" />
        <StatTile label="New today" value={data.totals.newToday} tone="info" hint={`${data.totals.newThisWeek} this week`} />
        <StatTile label="Expiring in 7 days" value={data.totals.expiringSoon} tone="warning" />
        <StatTile label="Users" value={data.totals.users.toLocaleString('en-IN')} />
        <StatTile label="Companies" value={data.totals.companies.toLocaleString('en-IN')} />
        <StatTile label="Applications tracked" value={data.totals.applications.toLocaleString('en-IN')} />
        <StatTile
          label="Sources healthy"
          value={`${data.ingestionHealth.filter((s) => s.status === 'SUCCESS').length}/${data.ingestionHealth.length}`}
          tone={data.ingestionHealth.some((s) => s.status === 'FAILED') ? 'danger' : 'success'}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Government & PSU vs private" />
          <div className="p-4">
            <DonutChart data={data.governmentVsPrivate} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Internships vs full-time" />
          <div className="p-4">
            <DonutChart data={data.internshipVsFullTime} />
          </div>
        </Card>

        <Card>
          <CardHeader title="By industry" />
          <div className="p-4">
            <BarList data={data.byIndustry} />
          </div>
        </Card>

        <Card>
          <CardHeader title="By domain" />
          <div className="p-4">
            <BarList data={data.byDomain} />
          </div>
        </Card>

        <Card>
          <CardHeader title="By location" />
          <div className="p-4">
            <BarList data={data.byLocation} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Most demanded skills" />
          <div className="p-4">
            <BarList data={data.topSkills} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Most active organisations" />
          <div className="p-4">
            <BarList data={data.topCompanies} />
          </div>
        </Card>

        <Card>
          <CardHeader title="By opportunity type" />
          <div className="p-4">
            <BarList data={data.byType.map((t) => ({ name: t.name.replace(/_/g, ' ').toLowerCase(), count: t.count }))} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Ingestion health" description="Last sync per source" />
        <ul className="divide-y divide-border">
          {data.ingestionHealth.map((source) => (
            <li key={source.sourceName} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="min-w-0 truncate">{source.sourceName}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-subtle">{timeAgo(source.lastSyncAt)}</span>
                <StatusDot status={source.status} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

