'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { NOTIFICATION_FREQUENCIES, type SavedSearchDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { timeAgo } from '@/lib/utils';

export default function AlertsPage() {
  return (
    <RequireAuth>
      <Alerts />
    </RequireAuth>
  );
}

const FREQUENCY_LABELS: Record<string, string> = {
  REALTIME: 'As they appear',
  DAILY: 'Once a day',
  WEEKLY: 'Once a week',
  NEVER: 'Paused',
};

/**
 * Feature 3 — saved searches with alerts.
 *
 * Government notification windows are short, so the point of this page is not
 * the saved filter but the alert: it is what stops a deadline being missed
 * between two visits to the site.
 */
function Alerts() {
  const [searches, setSearches] = useState<SavedSearchDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    api.savedSearches
      .list()
      .then(setSearches)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your alerts.'));
  };

  useEffect(load, []);

  const patch = async (id: string, body: { alertsEnabled?: boolean; frequency?: string }): Promise<void> => {
    setBusy(id);
    // Optimistic: the control reflects the intent straight away.
    setSearches((current) => current?.map((s) => (s.id === id ? { ...s, ...body } as SavedSearchDto : s)) ?? null);
    try {
      await api.savedSearches.update(id, body);
    } catch {
      load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string): Promise<void> => {
    setBusy(id);
    setSearches((current) => current?.filter((s) => s.id !== id) ?? null);
    try {
      await api.savedSearches.remove(id);
    } catch {
      load();
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Alerts</h1>
        <p className="mt-1 text-sm text-muted">
          Searches you asked to be told about. Government notification windows are short — an alert is
          usually the difference between applying and finding out too late.
        </p>
      </header>

      {!searches ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : searches.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔔"
            title="No alerts yet"
            description="Run a search you care about — say “government jobs for BTech CSE” — then use “Alert me” to be told when something new matches."
            action={
              <Link href="/opportunities">
                <Button size="sm">Start a search</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {searches.map((search) => (
            <Card key={search.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {search.name}
                    {search.alertsEnabled ? (
                      <Badge tone="success">Alerts on</Badge>
                    ) : (
                      <Badge>Paused</Badge>
                    )}
                    {search.newSinceLastRun > 0 && (
                      <Badge tone="brand">{search.newSinceLastRun} new</Badge>
                    )}
                  </span>
                }
                description={search.description}
              />

              <div className="flex flex-wrap items-center gap-3 p-4">
                <Link href={`/alerts/${search.id}`}>
                  <Button size="sm" variant="outline">
                    View {search.matchCount} {search.matchCount === 1 ? 'match' : 'matches'}
                  </Button>
                </Link>

                <label className="flex items-center gap-2 text-xs">
                  <span className="text-muted">Tell me</span>
                  <select
                    className="input h-8 w-40 py-0 text-xs"
                    value={search.frequency}
                    disabled={busy === search.id}
                    onChange={(e) => void patch(search.id, { frequency: e.target.value })}
                    aria-label={`Alert frequency for ${search.name}`}
                  >
                    {NOTIFICATION_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                    ))}
                  </select>
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-[rgb(var(--brand))]"
                    checked={search.alertsEnabled}
                    disabled={busy === search.id}
                    onChange={(e) => void patch(search.id, { alertsEnabled: e.target.checked })}
                  />
                  Alerts enabled
                </label>

                <span className="text-xs text-subtle">
                  {search.lastNotifiedAt
                    ? `Last alerted ${timeAgo(search.lastNotifiedAt)}`
                    : `Watching since ${timeAgo(search.createdAt)}`}
                </span>

                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-danger"
                  disabled={busy === search.id}
                  onClick={() => void remove(search.id)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
