'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaces in the browser console and any attached error tracker.
    console.error('Unhandled page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">
        This page failed to load. The API may be unreachable — check that it is running.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
