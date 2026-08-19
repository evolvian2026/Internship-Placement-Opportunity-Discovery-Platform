import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpportunityBrowser } from '@/components/OpportunityBrowser';
import { BrowserFallback } from '@/components/BrowserFallback';

export const metadata: Metadata = {
  title: 'PSU Recruitment & Graduate Trainee Openings',
  description: 'Public sector undertaking recruitment including GATE-based graduate trainee, executive trainee and apprentice posts.',
  alternates: { canonical: '/psu-jobs' },
  openGraph: { title: 'PSU Recruitment & Graduate Trainee Openings', description: 'Public sector undertaking recruitment including GATE-based graduate trainee, executive trainee and apprentice posts.', url: '/psu-jobs' },
};

export default function Page() {
  return (
    <Suspense fallback={<BrowserFallback />}>
      <OpportunityBrowser
        module="psu"
        title="PSU recruitment"
        description="Graduate trainee, executive trainee and apprentice posts — including which ones need a valid GATE score."
        hiddenFacets={["types"]}
      />
    </Suspense>
  );
}
