'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ProfileUnlocksDto } from '@odp/shared';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Skeleton } from './ui';

/**
 * Feature 1 — "add this one thing".
 *
 * A generic "complete your profile" nudge is easy to ignore. This names the
 * single field blocking the most opportunities and says exactly what filling it
 * would resolve, because that is the difference between a chore and a payoff.
 */
export function UnlockCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<ProfileUnlocksDto | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    api.dashboard.unlocks().then(setData).catch(() => setData(null));
    try {
      setDismissed(JSON.parse(window.localStorage.getItem('odp.dismissedUnlocks') ?? '[]'));
    } catch {
      // Storage can be unavailable; the card simply shows everything.
    }
  }, []);

  const dismiss = (field: string): void => {
    const next = [...dismissed, field];
    setDismissed(next);
    try {
      window.localStorage.setItem('odp.dismissedUnlocks', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  if (!data) return compact ? null : <Skeleton className="h-32" />;

  const visible = data.unlocks.filter((u) => !dismissed.includes(u.field));
  if (visible.length === 0 || data.unresolvedCount === 0) return null;

  const top = visible[0];

  if (compact) {
    return (
      <Link
        href={top.href}
        className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-3 transition-colors hover:border-warning"
      >
        <span className="text-lg" aria-hidden="true">🔑</span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{top.prompt}</span>{' '}
          <span className="text-muted">
            to settle {top.blockedCount} {top.blockedCount === 1 ? 'opportunity' : 'opportunities'}
          </span>
        </span>
        <span className="shrink-0 text-xs text-brand">Fix →</span>
      </Link>
    );
  }

  return (
    <Card className="border-warning/40">
      <CardHeader
        title="Unlock a definite answer"
        description={`${data.unresolvedCount} of the ${data.examinedCount} opportunities we checked cannot be decided yet`}
      />
      <ul className="divide-y divide-border">
        {visible.slice(0, 3).map((unlock) => (
          <li key={unlock.field} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{unlock.prompt}</h3>
                  <Badge tone="warning">
                    {unlock.blockedCount} blocked
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{unlock.detail}</p>
                {unlock.examples.length > 0 && (
                  <p className="mt-1.5 truncate text-[11px] text-subtle">
                    e.g.{' '}
                    {unlock.examples.map((e, i) => (
                      <span key={e.id}>
                        {i > 0 && ', '}
                        <Link href={`/opportunities/${e.slug}`} className="hover:text-brand">
                          {e.title}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link href={unlock.href}>
                  <Button size="sm">Add it</Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismiss(unlock.field)}
                  aria-label={`Dismiss ${unlock.label}`}
                >
                  ✕
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
