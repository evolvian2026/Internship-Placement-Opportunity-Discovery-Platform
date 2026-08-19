'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DashboardDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { OpportunityCard, OpportunityCardSkeleton } from '@/components/OpportunityCard';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Meter, StatTile } from '@/components/ui';
import { formatDate } from '@/lib/utils';

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const [data, setData] = useState<DashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    api.dashboard
      .get()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.'));
  };

  useEffect(load, []);

  if (error) return <ErrorState message={error} retry={load} />;

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-9 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <OpportunityCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const firstName = data.user.name.split(' ')[0];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">
          {data.greeting}, {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted">
          {data.stats.matchingOpportunities > 0
            ? `${data.stats.matchingOpportunities} opportunities match your profile.`
            : 'Complete your profile to start seeing matched opportunities.'}
        </p>

        {data.user.profileCompletion < 80 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft/50 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">
                Your profile is {data.user.profileCompletion}% complete
              </p>
              <p className="text-xs text-muted">
                Eligibility checks and match scores get sharper with every field you add.
              </p>
              <div className="mt-2 max-w-xs">
                <Meter value={data.user.profileCompletion} showValue={false} tone="warning" />
              </div>
            </div>
            <Link href="/profile">
              <Button size="sm">Complete profile</Button>
            </Link>
          </div>
        )}
      </header>

      <section aria-label="Your numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Matches" value={data.stats.matchingOpportunities} tone="brand" hint="65%+ match" />
        <StatTile label="New today" value={data.stats.newToday} tone="info" />
        <StatTile
          label="Deadlines today"
          value={data.stats.deadlinesToday}
          tone={data.stats.deadlinesToday > 0 ? 'danger' : 'neutral'}
          hint="From saved & tracked"
        />
        <StatTile label="Active applications" value={data.stats.activeApplications} tone="success" />
        <StatTile label="Saved" value={data.stats.savedCount} />
      </section>

      <section aria-labelledby="recommended">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="recommended" className="text-lg font-semibold">Recommended for you</h2>
          <Link href="/recommended" className="text-sm font-medium text-brand hover:underline">
            View all
          </Link>
        </div>
        {data.recommended.length === 0 ? (
          <Card>
            <EmptyState
              title="No recommendations yet"
              description="Add your education and skills, and matched opportunities will appear here."
              action={
                <Link href="/profile">
                  <Button size="sm">Build your profile</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.recommended.slice(0, 6).map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        )}
      </section>

      {data.closingSoon.length > 0 && (
        <section aria-labelledby="closing">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="closing" className="text-lg font-semibold">🔥 Closing soon</h2>
            <Link href="/deadlines" className="text-sm font-medium text-brand hover:underline">
              All deadlines
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.closingSoon.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} compact />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Your applications"
              description="Every opportunity you are tracking, newest first"
              action={
                <Link href="/applications">
                  <Button variant="outline" size="sm">Open tracker</Button>
                </Link>
              }
            />
            {data.activeApplications.length === 0 ? (
              <EmptyState
                title="Nothing tracked yet"
                description="Save an opportunity or mark it as applied, and it will show up here with its full history."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.activeApplications.map((application) => (
                  <li key={application.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/opportunities/${application.opportunity.slug}`}
                        className="truncate text-sm font-medium hover:text-brand"
                      >
                        {application.opportunity.title}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {application.opportunity.organizationName}
                        {application.interviewDate && ` · Interview ${formatDate(application.interviewDate)}`}
                      </p>
                    </div>
                    <Badge tone={application.status === 'OFFER' ? 'success' : 'brand'}>
                      {application.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section className="space-y-6">
          <Card>
            <CardHeader
              title="Career readiness"
              description="Transparent, and every part is improvable"
              action={
                <Link href="/readiness">
                  <Button variant="ghost" size="sm">Details</Button>
                </Link>
              }
            />
            <div className="p-4">
              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{data.readiness.overall}</span>
                <span className="text-sm text-subtle">/ 100</span>
              </div>
              <div className="space-y-2.5">
                {data.readiness.breakdown.map((item) => (
                  <Meter key={item.key} label={item.label} value={item.score} />
                ))}
              </div>
            </div>
          </Card>

          {data.recommendedSkills.length > 0 && (
            <Card>
              <CardHeader
                title="Recommended skills"
                description="From the postings that match you"
                action={
                  <Link href="/skills">
                    <Button variant="ghost" size="sm">Analyse</Button>
                  </Link>
                }
              />
              <ul className="divide-y divide-border">
                {data.recommendedSkills.map((skill) => (
                  <li key={skill.name} className="p-3">
                    <p className="text-sm font-medium">{skill.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{skill.reason}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
