'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type IngestionJobRow, type IngestionLogRow, type SourceDto } from '@/lib/api';
import { Badge, Button, Card, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { StatusDot } from '@/components/StatusDot';
import { timeAgo } from '@/lib/utils';

/**
 * Ingestion dashboard (requirement 34): per-source status, last sync, record
 * counts and the failure log for any run.
 */
export default function SourcesPage() {
  const [sources, setSources] = useState<SourceDto[] | null>(null);
  const [jobs, setJobs] = useState<IngestionJobRow[] | null>(null);
  const [logs, setLogs] = useState<{ jobId: string; rows: IngestionLogRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    Promise.all([api.admin.sources(), api.admin.ingestionJobs({ pageSize: 25 })])
      .then(([sourceList, jobList]) => {
        setSources(sourceList);
        setJobs(jobList.items);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load sources.'));
  };

  useEffect(load, []);

  const run = async (source: SourceDto): Promise<void> => {
    setRunning(source.id);
    try {
      await api.admin.runSource(source.id, true);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The run failed to start.');
    } finally {
      setRunning(null);
    }
  };

  const toggle = async (source: SourceDto): Promise<void> => {
    await api.admin.updateSource(source.id, { enabled: !source.enabled });
    load();
  };

  if (error) return <ErrorState message={error} retry={load} />;
  if (!sources || !jobs) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Source connectors"
          description="Every source records how it obtains data and whether robots.txt is honoured"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="p-3 font-medium">Source</th>
                <th className="p-3 font-medium">Kind</th>
                <th className="p-3 font-medium">Trust</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Last sync</th>
                <th className="p-3 text-right font-medium">Fetched</th>
                <th className="p-3 text-right font-medium">New</th>
                <th className="p-3 text-right font-medium">Updated</th>
                <th className="p-3 text-right font-medium">Dupes</th>
                <th className="p-3 text-right font-medium">Failed</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sources.map((source) => (
                <tr key={source.id}>
                  <td className="p-3">
                    <p className="font-medium">{source.name}</p>
                    <p className="text-xs text-subtle">
                      {source.respectsRobotsTxt ? '✓ robots.txt honoured' : '⚠ robots.txt bypassed'} ·{' '}
                      {source.rateLimitPerMinute}/min
                    </p>
                  </td>
                  <td className="p-3 text-xs text-muted">{source.kind}</td>
                  <td className="p-3">
                    <Badge tone={source.trustLevel === 'OFFICIAL' ? 'success' : source.trustLevel === 'PARTNER' ? 'info' : 'warning'}>
                      {source.trustLevel.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="p-3"><StatusDot status={source.enabled ? (source.lastStatus ?? 'PENDING') : 'DISABLED'} /></td>
                  <td className="p-3 text-xs text-muted">{timeAgo(source.lastSyncAt)}</td>
                  <td className="p-3 text-right tabular-nums">{source.stats.fetched}</td>
                  <td className="p-3 text-right tabular-nums text-success">{source.stats.created}</td>
                  <td className="p-3 text-right tabular-nums">{source.stats.updated}</td>
                  <td className="p-3 text-right tabular-nums text-muted">{source.stats.duplicates}</td>
                  <td className={`p-3 text-right tabular-nums ${source.stats.failed > 0 ? 'text-danger' : ''}`}>
                    {source.stats.failed}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => void toggle(source)}>
                        {source.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!source.enabled}
                        loading={running === source.id}
                        onClick={() => void run(source)}
                      >
                        Run now
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent ingestion runs" description="Click a run to see its record-level log" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="p-3 font-medium">Source</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Started</th>
                <th className="p-3 text-right font-medium">Fetched</th>
                <th className="p-3 text-right font-medium">New</th>
                <th className="p-3 text-right font-medium">Updated</th>
                <th className="p-3 text-right font-medium">Expired</th>
                <th className="p-3 text-right font-medium">Failed</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="p-3">{job.sourceName}</td>
                  <td className="p-3"><StatusDot status={job.status} /></td>
                  <td className="p-3 text-xs text-muted">{timeAgo(job.startedAt)}</td>
                  <td className="p-3 text-right tabular-nums">{job.recordsFetched}</td>
                  <td className="p-3 text-right tabular-nums text-success">{job.recordsCreated}</td>
                  <td className="p-3 text-right tabular-nums">{job.recordsUpdated}</td>
                  <td className="p-3 text-right tabular-nums">{job.recordsExpired}</td>
                  <td className={`p-3 text-right tabular-nums ${job.recordsFailed > 0 ? 'text-danger' : ''}`}>
                    {job.recordsFailed}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void api.admin.ingestionLogs(job.id).then((rows) => setLogs({ jobId: job.id, rows }))
                      }
                    >
                      Logs
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {jobs.some((j) => j.errorMessage) && (
          <div className="border-t border-border p-3">
            {jobs.filter((j) => j.errorMessage).map((j) => (
              <p key={j.id} className="text-xs text-danger">{j.sourceName}: {j.errorMessage}</p>
            ))}
          </div>
        )}
      </Card>

      {logs && (
        <Card>
          <CardHeader
            title="Run log"
            action={<Button size="sm" variant="ghost" onClick={() => setLogs(null)}>Close</Button>}
          />
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {logs.rows.map((row) => (
              <li key={row.id} className="flex gap-3 p-2.5 text-xs">
                <span
                  className={
                    row.level === 'error' ? 'text-danger' : row.level === 'warn' ? 'text-warning' : 'text-subtle'
                  }
                >
                  {row.level.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 text-muted">{row.message}</span>
                {row.externalId && <span className="shrink-0 text-subtle">{row.externalId}</span>}
              </li>
            ))}
            {logs.rows.length === 0 && <li className="p-4 text-center text-sm text-subtle">No log entries.</li>}
          </ul>
        </Card>
      )}
    </div>
  );
}
