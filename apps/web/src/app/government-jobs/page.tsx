import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpportunityBrowser } from '@/components/OpportunityBrowser';
import { BrowserFallback } from '@/components/BrowserFallback';

export const metadata: Metadata = {
  title: 'Government Jobs & Recruitment Notifications',
  description: 'Central and state government recruitment, exams, internships and apprenticeships, always linked to the official notification.',
  alternates: { canonical: '/government-jobs' },
  openGraph: { title: 'Government Jobs & Recruitment Notifications', description: 'Central and state government recruitment, exams, internships and apprenticeships, always linked to the official notification.', url: '/government-jobs' },
};

export default function Page() {
  return (
    <Suspense fallback={<BrowserFallback />}>
      <OpportunityBrowser
        module="government"
        title="Government & PSU opportunities"
        description="Recruitment notifications, exams, internships and apprenticeships. Every listing links to its official notification."
        hiddenFacets={["types"]}
      />
    </Suspense>
  );
}
