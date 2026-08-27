'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from './ui';

/**
 * Turns whatever the user is currently looking at into a standing alert.
 *
 * Offered at the point they have just seen the results, which is the moment
 * they know whether this search is worth watching.
 */
export function SaveSearchButton({
  query,
  filters,
  disabled,
}: {
  query: string | null;
  filters: Record<string, unknown>;
  disabled?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'naming' | 'saving' | 'saved'>('idle');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    setState('saving');
    setError(null);
    try {
      // Strip empty values so the stored filter set is the real one.
      const cleaned = Object.fromEntries(
        Object.entries(filters).filter(
          ([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0),
        ),
      );
      await api.savedSearches.create({ name: name.trim() || undefined, query, filters: cleaned });
      setState('saved');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'You already have an alert with that name.'
          : 'Could not save this search.',
      );
      setState('naming');
    }
  };

  if (state === 'saved') {
    return (
      <span className="flex items-center gap-2 text-xs text-success">
        ✓ Alert created
        <Link href="/alerts" className="text-brand hover:underline">Manage</Link>
      </span>
    );
  }

  if (state === 'naming' || state === 'saving') {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <input
          className="input h-8 w-44 py-0 text-xs"
          placeholder="Name this alert (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') setState('idle');
          }}
          aria-label="Name this alert"
          autoFocus
        />
        <Button size="sm" onClick={() => void save()} loading={state === 'saving'}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setState('idle')}>
          Cancel
        </Button>
        {error && <span className="w-full text-xs text-danger">{error}</span>}
      </span>
    );
  }

  return (
    <Button size="sm" variant="outline" disabled={disabled} onClick={() => setState('naming')}>
      🔔 Alert me
    </Button>
  );
}
