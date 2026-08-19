'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { Skeleton } from './ui';

/**
 * Client-side gate for signed-in pages.
 *
 * The API is the real authority — this only prevents rendering a page that
 * would immediately 401.
 */
export function RequireAuth({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (adminOnly && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [user, loading, adminOnly, router]);

  if (loading || !user || (adminOnly && user.role !== 'ADMIN')) {
    return (
      <div className="space-y-4 py-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return <>{children}</>;
}
