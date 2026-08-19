import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpportunityBrowser } from '@/components/OpportunityBrowser';
import { BrowserFallback } from '@/components/BrowserFallback';

export const metadata: Metadata = {
  title: 'Jobs & Full-time Opportunities',
  description: 'Full-time, part-time and contract openings across technology, core engineering, finance, healthcare and more.',
  alternates: { canonical: '/jobs' },
  openGraph: { title: 'Jobs & Full-time Opportunities', description: 'Full-time, part-time and contract openings across technology, core engineering, finance, healthcare and more.', url: '/jobs' },
};

export default function Page() {
  return (
    <Suspense fallback={<BrowserFallback />}>
      <OpportunityBrowser
        title="Jobs"
        description="Full-time, contract and part-time openings across every industry we cover."
        lockedFilters={{ types: ["FULL_TIME", "PART_TIME", "CONTRACT", "TRAINEE", "GRADUATE_PROGRAM"] }}
        hiddenFacets={["types"]}
      />
    </Suspense>
  );
}
