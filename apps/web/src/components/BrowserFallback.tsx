import { OpportunityCardSkeleton } from './OpportunityCard';

/** Suspense fallback shared by every page that renders the opportunity browser. */
export function BrowserFallback() {
  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <OpportunityCardSkeleton key={i} />
      ))}
    </div>
  );
}
