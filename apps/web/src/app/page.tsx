import Link from 'next/link';
import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Off-Campus Internships, Fresher Jobs, Government & PSU Opportunities',
  description:
    'One place to discover off-campus internships, fresher jobs, walk-ins, government and PSU recruitment — with eligibility checks, match scores and deadline tracking.',
  alternates: { canonical: '/' },
};

// Counts change through the day; revalidate rather than rebuilding.
export const revalidate = 300;

const CATEGORIES = [
  { href: '/internships', label: 'Internships', key: 'INTERNSHIP', blurb: 'Summer, winter, research and remote' },
  { href: '/fresher-jobs', label: 'Fresher Jobs', key: 'FULL_TIME', blurb: 'Off-campus drives and graduate programmes' },
  { href: '/government-jobs', label: 'Government', key: 'GOVERNMENT_JOB', blurb: 'Central, state, exams and notifications' },
  { href: '/psu-jobs', label: 'PSU', key: 'PSU_JOB', blurb: 'GATE-based and direct recruitment' },
  { href: '/jobs?types=WALK_IN,OFF_CAMPUS_DRIVE', label: 'Walk-ins & Drives', key: 'WALK_IN', blurb: 'Dates, venues and eligibility' },
  { href: '/jobs?types=APPRENTICESHIP', label: 'Apprenticeships', key: 'APPRENTICESHIP', blurb: 'Government and industry programmes' },
];

const PILLARS = [
  {
    title: 'What is available?',
    body: 'Opportunities aggregated from official career pages, government portals, PSU sites and public feeds — normalised into one consistent format.',
  },
  {
    title: 'Which am I eligible for?',
    body: 'An eligibility engine checks degree, branch, batch, CGPA, backlogs, experience and age against what each posting actually published — and says "needs review" rather than guessing.',
  },
  {
    title: 'Which are best for me?',
    body: 'A transparent match score weighs eligibility, skills, education, experience, location and your stated preferences. Eligibility gates the score, so you never see a high match on something you cannot apply for.',
  },
  {
    title: 'What should I do next?',
    body: 'Skill-gap analysis, a career-readiness score, deadline reminders and an application tracker that follows every opportunity from saved to offer.',
  },
];

export default async function HomePage() {
  // The landing page must render even when the API is unreachable.
  const counts = await api.opportunities.counts().catch(() => ({}) as Record<string, number>);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-16 pb-8">
      <section className="pt-6 text-center sm:pt-12">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">
          Your personal career command centre
        </p>
        <h1 className="mx-auto max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          Stop searching twelve sites for one opportunity
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted sm:text-lg">
          Off-campus internships, fresher jobs, walk-in drives, government notifications and PSU recruitment — in one
          place, checked against your eligibility, ranked by how well they fit you, and tracked through to the offer.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/register">
            <Button size="lg">Create your profile</Button>
          </Link>
          <Link href="/opportunities">
            <Button size="lg" variant="outline">
              Browse {total > 0 ? `${total.toLocaleString('en-IN')} ` : ''}opportunities
            </Button>
          </Link>
        </div>

        <p className="mt-4 text-xs text-subtle">
          Free for students · Applications always go through the official source
        </p>
      </section>

      <section aria-labelledby="categories">
        <h2 id="categories" className="mb-4 text-lg font-semibold">
          Start with what you are looking for
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((category) => (
            <Link
              key={category.href}
              href={category.href}
              className="card group p-4 transition-all hover:border-brand hover:shadow-md"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold group-hover:text-brand">{category.label}</h3>
                {counts[category.key] != null && (
                  <span className="text-xs tabular-nums text-subtle">{counts[category.key]}</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{category.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="pillars">
        <h2 id="pillars" className="mb-1 text-lg font-semibold">
          Four questions, answered for every opportunity
        </h2>
        <p className="mb-5 text-sm text-muted">
          This is a discovery engine, not a job board. Every listing keeps its original source, its last verified date
          and its official application link.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PILLARS.map((pillar, index) => (
            <div key={pillar.title} className="card p-5">
              <span className="text-xs font-bold text-brand">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-1 text-sm font-semibold">{pillar.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card bg-surface-2 p-8 text-center">
        <h2 className="text-xl font-semibold">Build your profile once</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
          Upload your resume and we extract your education, skills and experience for you to review and correct. From
          then on, every opportunity carries your match score and a plain-English eligibility check.
        </p>
        <Link href="/register" className="mt-5 inline-block">
          <Button size="lg">Get started — it takes two minutes</Button>
        </Link>
      </section>
    </div>
  );
}
