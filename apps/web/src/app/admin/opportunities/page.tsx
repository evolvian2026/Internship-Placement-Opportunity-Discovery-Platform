'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OPPORTUNITY_STATUSES, OPPORTUNITY_TYPES, type OpportunitySummaryDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { formatDate, timeAgo } from '@/lib/utils';

/** Admin opportunity management: search across every status, verify, expire, delete. */
export default function AdminOpportunitiesPage() {
  const [items, setItems] = useState<OpportunitySummaryDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = (): void => {
    setItems(null);
    setError(null);
    api.admin
      .opportunities({
        q: query || undefined,
        statuses: status || undefined,
        types: type || undefined,
        page,
        pageSize: 25,
      })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load opportunities.'));
  };

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, type, page]);

  const setStatusFor = async (id: string, next: string): Promise<void> => {
    await api.admin.setStatus(id, next);
    load();
  };

  const remove = async (id: string): Promise<void> => {
    await api.admin.deleteOpportunity(id);
    load();
  };

  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Opportunities"
          description={`${total.toLocaleString('en-IN')} rows, including expired and removed`}
          action={<Button size="sm" onClick={() => setCreating(true)}>Add opportunity</Button>}
        />
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <input
            className="input flex-1 min-w-48"
            placeholder="Search title or organisation"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            type="search"
            aria-label="Search opportunities"
          />
          <select
            className="input w-44"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {OPPORTUNITY_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
            ))}
          </select>
          <select
            className="input w-52"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {OPPORTUNITY_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</option>
            ))}
          </select>
        </div>

        {!items ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState title="No opportunities match" description="Adjust the search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="p-3 font-medium">Opportunity</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Deadline</th>
                  <th className="p-3 font-medium">Verified</th>
                  <th className="p-3 font-medium">Source</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((opportunity) => (
                  <tr key={opportunity.id}>
                    <td className="p-3">
                      <Link href={`/opportunities/${opportunity.slug}`} className="font-medium hover:text-brand">
                        {opportunity.title}
                      </Link>
                      <p className="text-xs text-subtle">{opportunity.organizationName}</p>
                      {opportunity.fraudFlags.length > 0 && (
                        <Badge tone="danger" className="mt-1">⚠ {opportunity.fraudFlags.length} flags</Badge>
                      )}
                    </td>
                    <td className="p-3 text-xs capitalize text-muted">
                      {opportunity.opportunityType.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="p-3">
                      <Badge
                        tone={
                          opportunity.status === 'VERIFIED' ? 'success' :
                          opportunity.status === 'EXPIRED' || opportunity.status === 'REMOVED' ? 'neutral' :
                          opportunity.status === 'UNVERIFIED' ? 'warning' : 'brand'
                        }
                      >
                        {opportunity.status.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted">{formatDate(opportunity.applicationDeadline)}</td>
                    <td className="p-3 text-xs text-muted">{timeAgo(opportunity.lastVerifiedAt)}</td>
                    <td className="p-3 text-xs text-muted">
                      {opportunity.sourceName}
                      {opportunity.sourceCount > 1 && ` +${opportunity.sourceCount - 1}`}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {opportunity.status !== 'VERIFIED' && (
                          <Button size="sm" variant="ghost" onClick={() => void setStatusFor(opportunity.id, 'VERIFIED')}>
                            Verify
                          </Button>
                        )}
                        {opportunity.status !== 'EXPIRED' && (
                          <Button size="sm" variant="ghost" onClick={() => void setStatusFor(opportunity.id, 'EXPIRED')}>
                            Expire
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => void remove(opportunity.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items && total > 25 && (
          <nav className="flex items-center justify-center gap-2 border-t border-border p-3" aria-label="Pagination">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="px-2 text-sm tabular-nums text-muted">
              Page {page} of {Math.ceil(total / 25)}
            </span>
            <Button size="sm" variant="outline" disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </nav>
        )}
      </Card>

      {creating && <CreateOpportunityDialog onClose={() => setCreating(false)} onCreated={load} />}
    </div>
  );
}

/** Manual entry, attributed to the "Manual Admin Entry" source so provenance is never blank. */
function CreateOpportunityDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '',
    organizationName: '',
    opportunityType: 'FULL_TIME',
    applicationUrl: '',
    description: '',
    city: '',
    applicationDeadline: '',
    skills: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await api.admin.createOpportunity({
        title: form.title,
        organizationName: form.organizationName,
        opportunityType: form.opportunityType,
        applicationUrl: form.applicationUrl,
        description: form.description,
        locations: form.city ? [{ city: form.city, country: 'India', isRemote: false }] : [],
        applicationDeadline: form.applicationDeadline ? new Date(form.applicationDeadline).toISOString() : null,
        skills: form.skills ? form.skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the opportunity.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="presentation">
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add opportunity"
      >
        <h2 className="text-lg font-semibold">Add opportunity</h2>
        <p className="mt-1 text-xs text-muted">
          Enter only what the official notification states. Anything left blank shows as “Not Specified”.
        </p>

        {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="a-title">Title</label>
            <input id="a-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="a-org">Organisation</label>
            <input id="a-org" className="input" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="a-type">Type</label>
              <select id="a-type" className="input" value={form.opportunityType} onChange={(e) => setForm({ ...form, opportunityType: e.target.value })}>
                {OPPORTUNITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="a-city">City</label>
              <input id="a-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="a-url">Official application URL</label>
            <input id="a-url" type="url" className="input" value={form.applicationUrl} onChange={(e) => setForm({ ...form, applicationUrl: e.target.value })} placeholder="https://" />
          </div>
          <div>
            <label className="label" htmlFor="a-deadline">Application deadline</label>
            <input id="a-deadline" type="date" className="input" value={form.applicationDeadline} onChange={(e) => setForm({ ...form, applicationDeadline: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="a-skills">Skills (comma separated)</label>
            <input id="a-skills" className="input" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="Python, SQL" />
          </div>
          <div>
            <label className="label" htmlFor="a-desc">Description</label>
            <textarea id="a-desc" className="input min-h-28" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            onClick={() => void submit()}
            loading={saving}
            disabled={!form.title || !form.organizationName || !form.applicationUrl}
            className="flex-1"
          >
            Create
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
