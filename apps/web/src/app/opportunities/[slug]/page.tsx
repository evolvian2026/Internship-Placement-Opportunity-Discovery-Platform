import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { NOT_SPECIFIED, OPPORTUNITY_TYPE_LABELS } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { OpportunityActions } from '@/components/OpportunityActions';
import { Badge, Card, CardHeader, Meter, ScoreRing } from '@/components/ui';
import { avatarColor, formatLongDate, initials, relativeDeadline, timeAgo } from '@/lib/utils';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Server-rendered so the page is crawlable and carries JobPosting structured
 * data (requirement 44). Personalised match/eligibility is fetched client-side
 * by the actions component for signed-in users.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const opportunity = await api.opportunities.get(slug, null);
    return {
      title: opportunity.seo.title,
      description: opportunity.seo.description,
      alternates: { canonical: `/opportunities/${opportunity.slug}` },
      openGraph: {
        title: opportunity.seo.title,
        description: opportunity.seo.description,
        url: opportunity.seo.canonicalUrl,
        type: 'article',
      },
      // Expired postings must not stay in the index.
      robots: opportunity.status === 'EXPIRED' ? { index: false, follow: true } : undefined,
    };
  } catch {
    return { title: 'Opportunity' };
  }
}

export default async function OpportunityDetailPage({ params }: Props) {
  const { slug } = await params;

  let opportunity;
  try {
    opportunity = await api.opportunities.get(slug, null);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const deadline = relativeDeadline(opportunity.applicationDeadline);
  const compensation = opportunity.stipendLabel ?? opportunity.salaryLabel;

  const sections: { title: string; items: string[] }[] = [
    { title: 'Responsibilities', items: opportunity.responsibilities },
    { title: 'Requirements', items: opportunity.requirements },
    { title: 'Preferred skills', items: opportunity.preferredSkills },
    { title: 'Selection process', items: opportunity.selectionProcess },
    { title: 'Documents required', items: opportunity.requiredDocuments },
  ].filter((section) => section.items.length > 0);

  const eligibility = opportunity.eligibilityDetail;
  const eligibilityRows: { label: string; value: string }[] = [
    { label: 'Degree', value: eligibility.degrees.length ? opportunity.educationLabel : NOT_SPECIFIED },
    { label: 'Branch', value: eligibility.branches.length ? eligibility.branches.join(', ') : NOT_SPECIFIED },
    { label: 'Batch', value: eligibility.graduationYears.length ? eligibility.graduationYears.join(', ') : NOT_SPECIFIED },
    { label: 'Minimum CGPA', value: eligibility.minCgpa != null ? String(eligibility.minCgpa) : NOT_SPECIFIED },
    { label: 'Minimum percentage', value: eligibility.minPercentage != null ? `${eligibility.minPercentage}%` : NOT_SPECIFIED },
    { label: 'Backlogs allowed', value: eligibility.maxBacklogs != null ? String(eligibility.maxBacklogs) : NOT_SPECIFIED },
    { label: 'Experience', value: opportunity.experienceLabel },
    {
      label: 'Age limit',
      value:
        eligibility.minAge != null || eligibility.maxAge != null
          ? `${eligibility.minAge ?? 'any'}–${eligibility.maxAge ?? 'any'} years`
          : NOT_SPECIFIED,
    },
    { label: 'Citizenship', value: eligibility.citizenship ?? NOT_SPECIFIED },
    ...(eligibility.genderRequirement ? [{ label: 'Gender', value: eligibility.genderRequirement }] : []),
  ];

  return (
    <>
      {/* JobPosting structured data for rich results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(opportunity.seo.jsonLd) }}
      />

      <div className="space-y-5">
        <nav aria-label="Breadcrumb" className="text-xs text-muted">
          <Link href="/opportunities" className="hover:text-brand">Opportunities</Link>
          <span className="mx-1.5">/</span>
          <span className="text-fg">{opportunity.title}</span>
        </nav>

        {opportunity.status === 'EXPIRED' && (
          <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
            This opportunity has passed its published deadline and is shown for reference only.
          </p>
        )}

        {opportunity.fraudFlags.length > 0 && (
          <div role="alert" className="rounded-lg border border-warning/40 bg-warning-soft/60 px-4 py-3">
            <p className="text-sm font-semibold text-warning">⚠ Exercise caution</p>
            <p className="mt-1 text-sm text-muted">
              Automated checks flagged this posting for review. Verify it on the official source before sharing personal
              details, and never pay a fee to apply for a private-sector role.
            </p>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <Card className="p-5">
              <div className="flex items-start gap-4">
                {opportunity.company?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={opportunity.company.logoUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl border border-border object-contain"
                  />
                ) : (
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${avatarColor(opportunity.organizationName)}`}
                    aria-hidden="true"
                  >
                    {initials(opportunity.organizationName)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold leading-snug sm:text-2xl">{opportunity.title}</h1>
                  <p className="mt-0.5 text-sm text-muted">
                    {opportunity.company ? (
                      <Link href={`/companies/${opportunity.company.slug}`} className="hover:text-brand">
                        {opportunity.organizationName}
                      </Link>
                    ) : (
                      opportunity.organizationName
                    )}
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Badge tone="brand">{OPPORTUNITY_TYPE_LABELS[opportunity.opportunityType]}</Badge>
                    {opportunity.industry && <Badge>{opportunity.industry}</Badge>}
                    {opportunity.domain && <Badge>{opportunity.domain}</Badge>}
                    {opportunity.governmentCategory && <Badge tone="info">{opportunity.governmentCategory}</Badge>}
                    {opportunity.psuCategory && <Badge tone="info">PSU · {opportunity.psuCategory}</Badge>}
                    {opportunity.gateRequired && <Badge tone="warning">GATE required</Badge>}
                    {opportunity.ppoAvailable && <Badge tone="success">PPO possible</Badge>}
                  </div>
                </div>

                {opportunity.match && <ScoreRing value={opportunity.match.overall} size={64} />}
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
                <Fact label="Location" value={`${opportunity.locationLabel}`} sub={opportunity.workMode !== 'NOT_SPECIFIED' ? opportunity.workMode.toLowerCase() : undefined} />
                <Fact label="Experience" value={opportunity.experienceLabel} />
                <Fact label={opportunity.stipendLabel ? 'Stipend' : 'Salary'} value={compensation} />
                <Fact
                  label="Deadline"
                  value={formatLongDate(opportunity.applicationDeadline)}
                  sub={deadline.label}
                  tone={deadline.tone}
                />
              </dl>

              {(opportunity.vacancies != null || opportunity.durationLabel || opportunity.applicationFee) && (
                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
                  {opportunity.vacancies != null && <Fact label="Vacancies" value={String(opportunity.vacancies)} />}
                  {opportunity.durationLabel && <Fact label="Duration" value={opportunity.durationLabel} />}
                  {opportunity.applicationFee && <Fact label="Application fee" value={opportunity.applicationFee} />}
                  {opportunity.examDate && <Fact label="Exam date" value={formatLongDate(opportunity.examDate)} />}
                </dl>
              )}
            </Card>

            {opportunity.description && (
              <Card>
                <CardHeader title="About the role" />
                <div className="p-5">
                  <p className="prose-source">{opportunity.description}</p>
                </div>
              </Card>
            )}

            {sections.map((section) => (
              <Card key={section.title}>
                <CardHeader title={section.title} />
                <ul className="space-y-2 p-5">
                  {section.items.map((item, index) => (
                    <li key={index} className="flex gap-2.5 text-sm text-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}

            <Card>
              <CardHeader
                title="Eligibility"
                description="Exactly as published by the source — nothing is inferred"
              />
              <dl className="grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
                {eligibilityRows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-3 border-b border-border pb-2 text-sm">
                    <dt className="text-muted">{row.label}</dt>
                    <dd className={`text-right font-medium ${row.value === NOT_SPECIFIED ? 'text-subtle' : 'text-fg'}`}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {eligibility.rawText && (
                <div className="border-t border-border p-5">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                    Published eligibility text
                  </p>
                  <p className="prose-source">{eligibility.rawText}</p>
                </div>
              )}
            </Card>

            {opportunity.skills.length > 0 && (
              <Card>
                <CardHeader title="Skills" />
                <div className="flex flex-wrap gap-1.5 p-5">
                  {opportunity.skills.map((skill) => (
                    <Badge key={skill}>{skill}</Badge>
                  ))}
                </div>
              </Card>
            )}

            {opportunity.importantDates.length > 0 && (
              <Card>
                <CardHeader title="Important dates" />
                <ul className="divide-y divide-border">
                  {opportunity.importantDates.map((date) => (
                    <li key={date.label} className="flex justify-between px-5 py-3 text-sm">
                      <span className="text-muted">{date.label}</span>
                      <span className="font-medium">{formatLongDate(date.date)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card className="p-4">
              <OpportunityActions opportunity={opportunity} />
            </Card>

            {opportunity.match && (
              <Card>
                <CardHeader title={`${opportunity.match.overall}% match`} description="How this was calculated" />
                <div className="space-y-2.5 p-4">
                  {opportunity.match.components.map((component) => (
                    <div key={component.key}>
                      <Meter label={component.label} value={component.score} />
                      <p className="mt-0.5 text-[11px] text-subtle">{component.explanation}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {opportunity.eligibility && (
              <Card>
                <CardHeader
                  title={
                    opportunity.eligibility.verdict === 'ELIGIBLE'
                      ? 'Eligible ✓'
                      : opportunity.eligibility.verdict === 'NEEDS_REVIEW'
                        ? 'Eligibility: needs review'
                        : 'Not eligible'
                  }
                  description="Checked against the published criteria"
                />
                <div className="space-y-1.5 p-4 text-sm">
                  {opportunity.eligibility.passed.map((check) => (
                    <p key={check.key} className="text-success">✓ {check.message}</p>
                  ))}
                  {opportunity.eligibility.failed.map((check) => (
                    <p key={check.key} className="text-danger">✗ {check.message}</p>
                  ))}
                  {opportunity.eligibility.unknown.map((check) => (
                    <p key={check.key} className="text-muted">? {check.message}</p>
                  ))}
                  {opportunity.eligibility.warnings.map((check) => (
                    <p key={check.key} className="text-warning">⚠ {check.message}</p>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <CardHeader title="Source & trust" />
              <div className="space-y-3 p-4 text-sm">
                <p className={opportunity.trustLevel === 'OFFICIAL' ? 'text-success' : 'text-warning'}>
                  {opportunity.trustLevel === 'OFFICIAL' ? '✓ Official source' : '⚠ Third-party source'}
                </p>
                <p className="text-xs text-muted">
                  Last verified {timeAgo(opportunity.lastVerifiedAt)}
                </p>
                <ul className="space-y-1.5 border-t border-border pt-3">
                  {opportunity.sources.map((source) => (
                    <li key={source.sourceId} className="text-xs">
                      <a
                        href={source.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-brand hover:underline"
                      >
                        {source.sourceName}
                      </a>
                      {source.isPrimary && <span className="ml-1 text-subtle">· primary</span>}
                    </li>
                  ))}
                </ul>
                {opportunity.sourceCount > 1 && (
                  <p className="text-xs text-subtle">Found on {opportunity.sourceCount} sources · Apply uses the official one</p>
                )}
              </div>
            </Card>

            {opportunity.company && (
              <Card>
                <CardHeader title="About the organisation" />
                <div className="space-y-2 p-4 text-sm">
                  <p className="font-medium">{opportunity.company.name}</p>
                  {opportunity.company.industry && <p className="text-xs text-muted">{opportunity.company.industry}</p>}
                  {opportunity.company.companyType && (
                    <Badge>{opportunity.company.companyType.replace(/_/g, ' ').toLowerCase()}</Badge>
                  )}
                  <Link
                    href={`/companies/${opportunity.company.slug}`}
                    className="block pt-1 text-xs text-brand hover:underline"
                  >
                    View all openings →
                  </Link>
                </div>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function Fact({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'danger' | 'warning' | 'muted' | 'success';
}) {
  const toneClass =
    tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-subtle';
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm font-semibold ${value === NOT_SPECIFIED ? 'text-subtle' : 'text-fg'}`}>
        {value}
      </dd>
      {sub && <p className={`text-[11px] capitalize ${toneClass}`}>{sub}</p>}
    </div>
  );
}
