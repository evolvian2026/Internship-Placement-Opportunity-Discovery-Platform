'use client';

import Link from 'next/link';
import { useState } from 'react';
import { NOT_SPECIFIED, OPPORTUNITY_TYPE_LABELS, type OpportunitySummaryDto } from '@odp/shared';
import { api } from '@/lib/api';
import { avatarColor, cn, formatDate, initials, relativeDeadline } from '@/lib/utils';
import { Badge, Button, ScoreRing } from './ui';

/**
 * The opportunity card (requirement 41).
 *
 * Shows: logo, company, role, type, location, work mode, salary/stipend,
 * eligibility, deadline, match %, source — with View / Save / Apply actions.
 */
export function OpportunityCard({
  opportunity,
  onSavedChange,
  compact = false,
}: {
  opportunity: OpportunitySummaryDto;
  onSavedChange?: (saved: boolean) => void;
  compact?: boolean;
}) {
  const [saved, setSaved] = useState(Boolean(opportunity.isSaved));
  const [saving, setSaving] = useState(false);

  const deadline = relativeDeadline(opportunity.applicationDeadline);
  const compensation = opportunity.stipendLabel ?? opportunity.salaryLabel;

  const toggleSave = async (): Promise<void> => {
    setSaving(true);
    // Optimistic: the button reflects the intent immediately.
    const next = !saved;
    setSaved(next);
    try {
      if (next) await api.saved.add(opportunity.id);
      else await api.saved.remove(opportunity.id);
      onSavedChange?.(next);
    } catch {
      setSaved(!next);
    } finally {
      setSaving(false);
    }
  };

  const eligibilityBadge = (() => {
    if (!opportunity.eligibility) return null;
    const { verdict } = opportunity.eligibility;
    if (verdict === 'ELIGIBLE') return <Badge tone="success">✓ Eligible</Badge>;
    if (verdict === 'NEEDS_REVIEW') return <Badge tone="warning">Needs review</Badge>;
    return <Badge tone="danger">Not eligible</Badge>;
  })();

  return (
    <article
      className={cn(
        'card group relative flex min-w-0 flex-col gap-3 p-4 transition-shadow hover:shadow-md',
        compact && 'gap-2 p-3',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Company logo, or a deterministic initials avatar. */}
        {opportunity.company?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={opportunity.company.logoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg border border-border object-contain"
            loading="lazy"
          />
        ) : (
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
              avatarColor(opportunity.organizationName),
            )}
            aria-hidden="true"
          >
            {initials(opportunity.organizationName)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-fg">
            <Link href={`/opportunities/${opportunity.slug}`} className="hover:text-brand focus:outline-none">
              {/* Stretched link makes the whole card clickable without nesting anchors. */}
              <span className="absolute inset-0" aria-hidden="true" />
              {opportunity.title}
            </Link>
          </h3>
          <p className="truncate text-xs text-muted">{opportunity.organizationName}</p>
        </div>

        {opportunity.match && <ScoreRing value={opportunity.match.overall} size={compact ? 44 : 52} />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{OPPORTUNITY_TYPE_LABELS[opportunity.opportunityType]}</Badge>
        {eligibilityBadge}
        {opportunity.workMode !== 'NOT_SPECIFIED' && (
          <Badge>{opportunity.workMode === 'REMOTE' ? 'Remote' : opportunity.workMode === 'HYBRID' ? 'Hybrid' : 'On-site'}</Badge>
        )}
        {opportunity.fraudFlags.length > 0 && <Badge tone="danger">⚠ Exercise caution</Badge>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="min-w-0">
          <dt className="text-subtle">Location</dt>
          <dd className="truncate font-medium text-fg">{opportunity.locationLabel}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-subtle">{opportunity.stipendLabel ? 'Stipend' : 'Salary'}</dt>
          <dd className={cn('truncate font-medium', compensation === NOT_SPECIFIED ? 'text-subtle' : 'text-fg')}>
            {compensation}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-subtle">Eligibility</dt>
          <dd className="truncate font-medium text-fg">{opportunity.educationLabel}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-subtle">Experience</dt>
          <dd className="truncate font-medium text-fg">{opportunity.experienceLabel}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="min-w-0">
          <p
            className={cn(
              'text-xs font-medium',
              deadline.tone === 'danger' && 'text-danger',
              deadline.tone === 'warning' && 'text-warning',
              deadline.tone === 'success' && 'text-success',
              deadline.tone === 'muted' && 'text-subtle',
            )}
          >
            {deadline.days !== null && deadline.days <= 1 && deadline.days >= 0 && '🔥 '}
            {deadline.label}
          </p>
          <p className="truncate text-[11px] text-subtle">
            {opportunity.trustLevel === 'OFFICIAL' ? '✓ Official source' : '⚠ Third-party source'} ·{' '}
            {opportunity.sourceName}
            {opportunity.sourceCount > 1 && ` · found on ${opportunity.sourceCount} sources`}
          </p>
        </div>

        {/* z-10 lifts the buttons above the stretched card link. */}
        <div className="relative z-10 flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSave}
            disabled={saving}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from saved' : 'Save opportunity'}
            title={saved ? 'Saved' : 'Save'}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill={saved ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.open(opportunity.applicationUrl, '_blank', 'noopener,noreferrer')}
          >
            Apply
          </Button>
        </div>
      </div>

      {opportunity.applicationStatus && (
        <p className="text-[11px] text-brand">Tracked · {opportunity.applicationStatus.replace(/_/g, ' ').toLowerCase()}</p>
      )}
      {opportunity.postedDate && !compact && (
        <p className="text-[11px] text-subtle">Posted {formatDate(opportunity.postedDate)}</p>
      )}
    </article>
  );
}

export function OpportunityCardSkeleton() {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start gap-3">
        <div className="skeleton h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
        </div>
        <div className="skeleton h-12 w-12 rounded-full" />
      </div>
      <div className="flex gap-1.5">
        <div className="skeleton h-5 w-20 rounded-md" />
        <div className="skeleton h-5 w-16 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-8" />
        <div className="skeleton h-8" />
        <div className="skeleton h-8" />
        <div className="skeleton h-8" />
      </div>
      <div className="skeleton h-9" />
    </div>
  );
}
