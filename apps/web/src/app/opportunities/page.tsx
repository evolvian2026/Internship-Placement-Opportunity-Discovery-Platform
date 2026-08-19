import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpportunityBrowser } from '@/components/OpportunityBrowser';
import { BrowserFallback } from '@/components/BrowserFallback';

export const metadata: Metadata = {
  title: 'Search Opportunities',
  description:
    'Search internships, jobs, government and PSU opportunities by role, skill, location, degree, batch and deadline.',
  alternates: { canonical: '/opportunities' },
};

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<BrowserFallback />}>
      <OpportunityBrowser
        title="Search opportunities"
        description="Natural language works — try “AI internship remote” or “government jobs for BTech CSE 2026”."
      />
    </Suspense>
  );
}

