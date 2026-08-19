'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApplicationStatus, OpportunityDetailDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { Button } from './ui';

/**
 * Apply / Save / Track actions.
 *
 * "Apply" always opens the official source in a new tab — the platform never
 * pretends an application was submitted here (requirement 16).
 */
export function OpportunityActions({ opportunity }: { opportunity: OpportunityDetailDto }) {
  const { user } = useAuth();
  const router = useRouter();
  const [saved, setSaved] = useState(Boolean(opportunity.isSaved));
  const [status, setStatus] = useState<ApplicationStatus | null>(opportunity.applicationStatus ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requireLogin = (): boolean => {
    if (user) return false;
    router.push('/login');
    return true;
  };

  const toggleSave = async (): Promise<void> => {
    if (requireLogin()) return;
    setBusy(true);
    setError(null);
    const next = !saved;
    setSaved(next);
    try {
      if (next) await api.saved.add(opportunity.id);
      else await api.saved.remove(opportunity.id);
    } catch (err) {
      setSaved(!next);
      setError(err instanceof ApiError ? err.message : 'Could not update your saved list.');
    } finally {
      setBusy(false);
    }
  };

  /** Opens the official page and starts tracking in the same action. */
  const apply = async (): Promise<void> => {
    window.open(opportunity.applicationUrl, '_blank', 'noopener,noreferrer');

    if (!user || status) return;
    try {
      await api.applications.create({ opportunityId: opportunity.id, status: 'APPLIED' });
      setStatus('APPLIED');
    } catch {
      // Tracking is a convenience; failing it must not disrupt applying.
    }
  };

  const track = async (): Promise<void> => {
    if (requireLogin()) return;
    setBusy(true);
    setError(null);
    try {
      await api.applications.create({ opportunityId: opportunity.id, status: 'INTERESTED' });
      setStatus('INTERESTED');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start tracking.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button size="lg" className="w-full" onClick={() => void apply()}>
        Apply on official site
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
      <p className="text-center text-[11px] text-subtle">
        Opens {new URL(opportunity.applicationUrl).hostname} · applications are not submitted from this platform
      </p>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button variant="outline" onClick={() => void toggleSave()} disabled={busy} aria-pressed={saved}>
          {saved ? '★ Saved' : '☆ Save'}
        </Button>
        {status ? (
          <Button variant="secondary" onClick={() => router.push('/applications')}>
            {status.replace(/_/g, ' ').toLowerCase()}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void track()} disabled={busy}>
            Track
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
