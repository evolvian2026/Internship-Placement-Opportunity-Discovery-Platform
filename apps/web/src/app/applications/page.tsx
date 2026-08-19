'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { APPLICATION_PIPELINE, APPLICATION_STATUSES, type ApplicationDto, type UserAnalyticsDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, StatTile } from '@/components/ui';
import { formatDate } from '@/lib/utils';

export default function ApplicationsPage() {
  return (
    <RequireAuth>
      <Tracker />
    </RequireAuth>
  );
}

type Stage = { status: string; label: string; items: ApplicationDto[] };

function Tracker() {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [analytics, setAnalytics] = useState<UserAnalyticsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [selected, setSelected] = useState<ApplicationDto | null>(null);

  const load = (): void => {
    setError(null);
    Promise.all([api.applications.pipeline(), api.applications.analytics()])
      .then(([pipeline, stats]) => {
        setStages(pipeline);
        setAnalytics(stats);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your applications.'));
  };

  useEffect(load, []);

  const move = async (application: ApplicationDto, status: string): Promise<void> => {
    await api.applications.update(application.id, { status });
    load();
    setSelected(null);
  };

  if (error) return <ErrorState message={error} retry={load} />;

  if (!stages || !analytics) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const all = stages.flatMap((s) => s.items);
  const boardStages = stages.filter((s) => APPLICATION_PIPELINE.includes(s.status as never));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Application tracker</h1>
          <p className="mt-1 text-sm text-muted">
            Every opportunity you are tracking, from saved through to offer.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
          {(['board', 'list'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === mode ? 'bg-surface text-fg shadow-sm' : 'text-muted'
              }`}
              aria-pressed={view === mode}
            >
              {mode}
            </button>
          ))}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Applied" value={analytics.applications} tone="brand" />
        <StatTile label="Interviews" value={analytics.interviews} tone="info" />
        <StatTile label="Offers" value={analytics.offers} tone="success" />
        <StatTile
          label="Response rate"
          value={`${analytics.responseRatePercent}%`}
          hint={`${analytics.rejections} rejected`}
        />
      </section>

      {all.length === 0 ? (
        <Card>
          <EmptyState
            icon="📋"
            title="You are not tracking anything yet"
            description="Save an opportunity or mark it as applied, and it appears here with its full stage history."
            action={
              <Link href="/opportunities">
                <Button size="sm">Find opportunities</Button>
              </Link>
            }
          />
        </Card>
      ) : view === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex min-w-max gap-3">
            {boardStages.map((stage) => (
              <div key={stage.status} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">{stage.label}</h2>
                  <span className="text-xs tabular-nums text-subtle">{stage.items.length}</span>
                </div>
                <div className="space-y-2">
                  {stage.items.map((application) => (
                    <button
                      key={application.id}
                      type="button"
                      onClick={() => setSelected(application)}
                      className="card w-full p-3 text-left transition-shadow hover:shadow-md"
                    >
                      <p className="truncate text-sm font-medium">{application.opportunity.title}</p>
                      <p className="truncate text-xs text-muted">{application.opportunity.organizationName}</p>
                      {application.interviewDate && (
                        <p className="mt-1.5 text-[11px] text-info">
                          Interview {formatDate(application.interviewDate)}
                        </p>
                      )}
                      {application.opportunity.applicationDeadline && (
                        <p className="mt-0.5 text-[11px] text-subtle">
                          Closes {formatDate(application.opportunity.applicationDeadline)}
                        </p>
                      )}
                    </button>
                  ))}
                  {stage.items.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-subtle">
                      Nothing here
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {all.map((application) => (
              <li key={application.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/opportunities/${application.opportunity.slug}`}
                    className="truncate text-sm font-medium hover:text-brand"
                  >
                    {application.opportunity.title}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {application.opportunity.organizationName}
                    {application.referenceNumber && ` · Ref ${application.referenceNumber}`}
                  </p>
                </div>
                <Badge tone={application.status === 'OFFER' ? 'success' : application.status === 'REJECTED' ? 'danger' : 'brand'}>
                  {application.status.replace(/_/g, ' ').toLowerCase()}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => setSelected(application)}>
                  Update
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {selected && (
        <ApplicationDrawer
          application={selected}
          onClose={() => setSelected(null)}
          onMove={move}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ApplicationDrawer({
  application,
  onClose,
  onMove,
  onSaved,
}: {
  application: ApplicationDto;
  onClose: () => void;
  onMove: (application: ApplicationDto, status: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(application.notes ?? '');
  const [interviewDate, setInterviewDate] = useState(application.interviewDate?.slice(0, 10) ?? '');
  const [followUpDate, setFollowUpDate] = useState(application.followUpDate?.slice(0, 10) ?? '');
  const [recruiterName, setRecruiterName] = useState(application.recruiterName ?? '');
  const [referenceNumber, setReferenceNumber] = useState(application.referenceNumber ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await api.applications.update(application.id, {
        notes: notes || null,
        interviewDate: interviewDate ? new Date(interviewDate).toISOString() : null,
        followUpDate: followUpDate ? new Date(followUpDate).toISOString() : null,
        recruiterName: recruiterName || null,
        referenceNumber: referenceNumber || null,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} role="presentation">
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Update application"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{application.opportunity.title}</h2>
            <p className="truncate text-sm text-muted">{application.opportunity.organizationName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-5">
          <label className="label" htmlFor="stage">Stage</label>
          <select
            id="stage"
            className="input"
            value={application.status}
            onChange={(e) => void onMove(application, e.target.value)}
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="interview">Interview date</label>
            <input id="interview" type="date" className="input" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="followup">Follow-up date</label>
            <input id="followup" type="date" className="input" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="recruiter">Recruiter</label>
          <input id="recruiter" className="input" value={recruiterName} onChange={(e) => setRecruiterName(e.target.value)} placeholder="Name or email" />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="reference">Application reference</label>
          <input id="reference" className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="REQ-1234" />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="notes">Notes</label>
          <textarea id="notes" className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this application" />
        </div>

        <div className="mt-5 flex gap-2">
          <Button onClick={() => void save()} loading={saving} className="flex-1">Save</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">History</h3>
          <ol className="space-y-2">
            {application.events.map((event) => (
              <li key={event.id} className="flex gap-2 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                <div>
                  <p className="font-medium capitalize">{event.status.replace(/_/g, ' ').toLowerCase()}</p>
                  <p className="text-subtle">{formatDate(event.occurredAt)}{event.note ? ` · ${event.note}` : ''}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
