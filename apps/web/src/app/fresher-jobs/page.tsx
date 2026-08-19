import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpportunityBrowser } from '@/components/OpportunityBrowser';
import { BrowserFallback } from '@/components/BrowserFallback';

export const metadata: Metadata = {
  title: 'Fresher Jobs & Off-Campus Drives',
  description: 'Off-campus drives, walk-ins, graduate programmes and entry-level roles for candidates with 0-1 years of experience.',
  alternates: { canonical: '/fresher-jobs' },
  openGraph: { title: 'Fresher Jobs & Off-Campus Drives', description: 'Off-campus drives, walk-ins, graduate programmes and entry-level roles for candidates with 0-1 years of experience.', url: '/fresher-jobs' },
};

export default function Page() {
  return (
    <Suspense fallback={<BrowserFallback />}>
      <OpportunityBrowser
        module="freshers"
        title="Fresher & off-campus"
        description="Off-campus drives, walk-ins, graduate trainee programmes and mass hiring — filtered to 0–1 years of experience."
        hiddenFacets={["types"]}
      />
    </Suspense>
  );
}
