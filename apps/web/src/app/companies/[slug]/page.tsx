import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { OpportunitySummaryDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { OpportunityCard } from '@/components/OpportunityCard';
import { Badge, Card, EmptyState } from '@/components/ui';
import { avatarColor, initials } from '@/lib/utils';

interface Props {
  params: Promise<{ slug: string }>;
}

interface CompanyDetail {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  industry: string | null;
  companyType: string | null;
  website: string | null;
  careerPageUrl: string | null;
  description: string | null;
  headquarters: string | null;
  employeeCount: string | null;
  isVerified: boolean;
  followerCount: number;
  openOpportunities: number;
  opportunities: OpportunitySummaryDto[];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const company = (await api.companies.get(slug, null)) as unknown as CompanyDetail;
    return {
      title: `${company.name} — Openings & Internships`,
      description:
        company.description?.slice(0, 160) ??
        `${company.openOpportunities} open opportunities at ${company.name}. See eligibility, deadlines and apply through the official careers page.`,
      alternates: { canonical: `/companies/${company.slug}` },
    };
  } catch {
    return { title: 'Company' };
  }
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params;

  let company: CompanyDetail;
  try {
    company = (await api.companies.get(slug, null)) as unknown as CompanyDetail;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-muted">
        <Link href="/companies" className="hover:text-brand">Companies</Link>
        <span className="mx-1.5">/</span>
        <span className="text-fg">{company.name}</span>
      </nav>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt="" className="h-16 w-16 rounded-xl border border-border object-contain" />
          ) : (
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${avatarColor(company.name)}`}
              aria-hidden="true"
            >
              {initials(company.name)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold sm:text-2xl">{company.name}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {[company.industry, company.headquarters, company.employeeCount && `${company.employeeCount} employees`]
                .filter(Boolean)
                .join(' · ') || 'Details not published'}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {company.companyType && <Badge>{company.companyType.replace(/_/g, ' ').toLowerCase()}</Badge>}
              <Badge tone="brand">{company.openOpportunities} open opportunities</Badge>
              {company.isVerified && <Badge tone="success">✓ Verified</Badge>}
            </div>
          </div>

          {(company.careerPageUrl ?? company.website) && (
            <a
              href={company.careerPageUrl ?? company.website ?? '#'}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-sm text-brand hover:underline"
            >
              Official careers page →
            </a>
          )}
        </div>

        {company.description && <p className="prose-source mt-4 border-t border-border pt-4">{company.description}</p>}
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Open opportunities</h2>
        {company.opportunities.length === 0 ? (
          <Card>
            <EmptyState title="No live openings" description="Follow this company to be alerted when it posts something new." />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {company.opportunities.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
