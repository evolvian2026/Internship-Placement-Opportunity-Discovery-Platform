'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CareerRecommendationDto, OpportunitySummaryDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { OpportunityCard, OpportunityCardSkeleton } from '@/components/OpportunityCard';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Meter } from '@/components/ui';

export default function RecommendedPage() {
  return (
    <RequireAuth>
      <Recommended />
    </RequireAuth>
  );
}

function Recommended() {
  const [items, setItems] = useState<OpportunitySummaryDto[] | null>(null);
  const [recommendations, setRecommendations] = useState<CareerRecommendationDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    Promise.all([
      api.opportunities.search({ sort: 'match', pageSize: 24, minMatchScore: 50 }),
      api.dashboard.recommendations(),
    ])
      .then(([search, recs]) => {
        setItems(search.items);
        setRecommendations(recs);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load recommendations.'));
  };

  useEffect(load, []);

  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Recommended for you</h1>
        <p className="mt-1 text-sm text-muted">
          Ranked by eligibility first, then skills, education, experience, location and your stated preferences.
        </p>
      </header>

      {recommendations && recommendations.roles.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Strong career matches" description="Roles with live openings that fit your profile" />
            <ol className="divide-y divide-border">
              {recommendations.roles.map((role, index) => (
                <li key={role.name} className="flex items-center gap-3 p-3">
                  <span className="w-5 text-sm font-bold text-brand">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/opportunities?q=${encodeURIComponent(role.name)}`}
                      className="truncate text-sm font-medium hover:text-brand"
                    >
                      {role.name}
                    </Link>
                    <p className="truncate text-xs text-muted">{role.reason}</p>
                  </div>
                  <div className="w-20 shrink-0">
                    <Meter value={role.score} showValue />
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <div className="space-y-4">
            {recommendations.industries.length > 0 && (
              <Card>
                <CardHeader title="Industries that fit" />
                <ul className="space-y-2 p-3">
                  {recommendations.industries.map((industry) => (
                    <li key={industry.name}>
                      <Meter label={industry.name} value={industry.score} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {recommendations.certifications.length > 0 && (
              <Card>
                <CardHeader title="Certifications worth having" />
                <ul className="divide-y divide-border">
                  {recommendations.certifications.map((cert) => (
                    <li key={cert.name} className="p-3">
                      <p className="text-sm font-medium">{cert.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{cert.reason}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      {recommendations && recommendations.companies.length > 0 && (
        <Card>
          <CardHeader title="Companies hiring for your profile" />
          <div className="flex flex-wrap gap-2 p-4">
            {recommendations.companies.map((company) => (
              <Link key={company.id} href={`/companies/${company.slug}`}>
                <Badge tone="brand">{company.name}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Your top matches</h2>
        {!items ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <OpportunityCardSkeleton key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              title="No strong matches yet"
              description="Add your education, skills and preferences — matching needs those to rank anything."
              action={<Link href="/profile"><Button size="sm">Complete your profile</Button></Link>}
            />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
