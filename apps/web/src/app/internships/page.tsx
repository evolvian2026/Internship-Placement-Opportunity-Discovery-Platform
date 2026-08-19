import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpportunityBrowser } from '@/components/OpportunityBrowser';
import { BrowserFallback } from '@/components/BrowserFallback';

export const metadata: Metadata = {
  title: 'Internships for Students & Freshers',
  description: 'Summer, winter, research, government and remote internships with stipend, duration, PPO possibility, eligibility and deadlines.',
  alternates: { canonical: '/internships' },
  openGraph: { title: 'Internships for Students & Freshers', description: 'Summer, winter, research, government and remote internships with stipend, duration, PPO possibility, eligibility and deadlines.', url: '/internships' },
};

export default function Page() {
  return (
    <Suspense fallback={<BrowserFallback />}>
      <OpportunityBrowser
        module="internships"
        title="Internships"
        description="Summer, winter, research and remote internships — with stipend, duration and PPO details where the source publishes them."
        hiddenFacets={["types"]}
      />
    </Suspense>
  );
}
