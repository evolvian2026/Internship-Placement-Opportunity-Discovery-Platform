'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type AuditRow } from '@/lib/api';
import { Card, CardHeader, ErrorState, Skeleton, StatTile } from '@/components/ui';
import { timeAgo } from '@/lib/utils';

interface Health {
  database: { status: string; latencyMs: number };
  ingestion: { failedJobsLast24h: number };
  queue: Record<string, number> | { status: string };
  oldestUnverifiedAt: string | null;
  uptimeSeconds: number;
  memoryMb: number;
}

export default function SystemPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    Promise.all([api.admin.systemHealth(), api.admin.auditLog()])
      .then(([h, a]) => {
        setHealth(h as unknown as Health);
        setAudit(a);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load system health.'));
  };

  useEffect(() => {
    load();
    // Health is only meaningful when it is current.
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (error) return <ErrorState message={error} retry={load} />;
  if (!health || !audit) return <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;

  const queue = 'status' in health.queue ? null : health.queue;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Database"
          value={`${health.database.latencyMs} ms`}
          tone={health.database.latencyMs < 50 ? 'success' : 'warning'}
          hint="Round-trip latency"
        />
        <StatTile
          label="Failed jobs (24h)"
          value={health.ingestion.failedJobsLast24h}
          tone={health.ingestion.failedJobsLast24h > 0 ? 'danger' : 'success'}
        />
        <StatTile label="Uptime" value={`${Math.floor(health.uptimeSeconds / 3600)}h ${Math.floor((health.uptimeSeconds % 3600) / 60)}m`} />
        <StatTile label="Memory" value={`${health.memoryMb} MB`} />
      </section>

      <Card>
        <CardHeader title="Job queue" description={queue ? 'BullMQ depth' : 'Redis is not configured — the in-process scheduler is running'} />
        <div className="grid gap-3 p-4 sm:grid-cols-4">
          {queue ? (
            Object.entries(queue).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs capitalize text-subtle">{key}</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
              </div>
            ))
          ) : (
            <p className="col-span-4 text-sm text-muted">
              Set REDIS_URL to run ingestion through BullMQ with retries, backoff and a dead-letter queue.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Audit log" description="Every administrative action" />
        <ul className="max-h-96 divide-y divide-border overflow-y-auto">
          {audit.map((row) => (
            <li key={row.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="font-medium">{row.action}</span>
              <span className="text-xs text-muted">{row.entityType}</span>
              <span className="ml-auto text-xs text-subtle">{timeAgo(row.createdAt)}</span>
            </li>
          ))}
          {audit.length === 0 && <li className="p-6 text-center text-sm text-subtle">No administrative actions yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
