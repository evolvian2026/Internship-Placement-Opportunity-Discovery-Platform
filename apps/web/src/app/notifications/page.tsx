'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { NotificationDto, NotificationPreferencesDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { timeAgo } from '@/lib/utils';

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  );
}

const PREFERENCE_ROWS: { key: keyof NotificationPreferencesDto; label: string; hint: string }[] = [
  { key: 'newMatches', label: 'New matches', hint: 'A digest of opportunities matching your profile' },
  { key: 'deadlineReminders', label: 'Deadline reminders', hint: 'Before a saved or tracked opportunity closes' },
  { key: 'followedCompanies', label: 'Followed companies', hint: 'When a company you follow posts something new' },
  { key: 'applicationFollowUps', label: 'Application follow-ups', hint: 'When a follow-up you scheduled is due' },
  { key: 'governmentAlerts', label: 'Government alerts', hint: 'New government or PSU postings matching your degree' },
];

function Notifications() {
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferencesDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    Promise.all([api.notifications.list(), api.notifications.preferences()])
      .then(([list, preferences]) => {
        setItems(list.items);
        setPrefs(preferences);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load notifications.'));
  };

  useEffect(load, []);

  const savePrefs = async (patch: Partial<NotificationPreferencesDto>): Promise<void> => {
    setPrefs((current) => (current ? { ...current, ...patch } : current));
    await api.notifications.updatePreferences(patch).catch(load);
  };

  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Notifications</h1>
          {items && items.some((n) => !n.readAt) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void api.notifications.markAllRead().then(load)}
            >
              Mark all read
            </Button>
          )}
        </header>

        {!items ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon="🔔"
              title="No notifications yet"
              description="Save opportunities and follow companies, and alerts will show up here."
            />
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {items.map((notification) => (
                <li key={notification.id} className={notification.readAt ? 'p-4' : 'bg-brand-soft/30 p-4'}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{notification.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{notification.body}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-xs text-subtle">{timeAgo(notification.createdAt)}</span>
                        {notification.link && (
                          <Link
                            href={notification.link}
                            className="text-xs text-brand hover:underline"
                            onClick={() => void api.notifications.markRead(notification.id)}
                          >
                            Open →
                          </Link>
                        )}
                      </div>
                    </div>
                    {!notification.readAt && <Badge tone="brand">New</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <aside>
        <Card>
          <CardHeader title="Preferences" description="Turn off anything you do not want" />
          {!prefs ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <div className="space-y-4 p-4">
              <div>
                <label className="label" htmlFor="frequency">Frequency</label>
                <select
                  id="frequency"
                  className="input"
                  value={prefs.frequency}
                  onChange={(e) => void savePrefs({ frequency: e.target.value as never })}
                >
                  <option value="REALTIME">As they happen</option>
                  <option value="DAILY">Daily digest</option>
                  <option value="WEEKLY">Weekly digest</option>
                  <option value="NEVER">Never</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="lead">Remind me this many days before a deadline</label>
                <input
                  id="lead"
                  type="number"
                  min={0}
                  max={30}
                  className="input"
                  value={prefs.deadlineLeadDays}
                  onChange={(e) => void savePrefs({ deadlineLeadDays: Number(e.target.value) })}
                />
              </div>

              <fieldset className="space-y-2.5 border-t border-border pt-3">
                <legend className="sr-only">Notification types</legend>
                {PREFERENCE_ROWS.map((row) => (
                  <label key={row.key} className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border accent-[rgb(var(--brand))]"
                      checked={Boolean(prefs[row.key])}
                      onChange={(e) => void savePrefs({ [row.key]: e.target.checked })}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{row.label}</span>
                      <span className="block text-xs text-muted">{row.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="space-y-2.5 border-t border-border pt-3">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Channels</legend>
                {([
                  ['inAppEnabled', 'In-app'],
                  ['emailEnabled', 'Email'],
                  ['browserEnabled', 'Browser push'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-[rgb(var(--brand))]"
                      checked={Boolean(prefs[key])}
                      onChange={(e) => void savePrefs({ [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}
