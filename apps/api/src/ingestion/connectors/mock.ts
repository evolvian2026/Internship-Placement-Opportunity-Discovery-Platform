import type { Degree, OpportunityType } from '@odp/shared';
import { addDays } from '../../lib/dates';
import type { Connector, ConnectorContext, RawOpportunity } from '../types';
import {
  MOCK_CITIES,
  MOCK_COMPANIES,
  MOCK_GOVERNMENT_POSTS,
  MOCK_PSU_POSTS,
  MOCK_ROLES,
} from './mock.data';

/**
 * Mock connector (requirement 49).
 *
 * Generates realistic — and clearly fictional — opportunities across every
 * industry the platform covers, so the full UI, matching engine and analytics
 * stack can be developed and demonstrated with no external dependency.
 *
 * Generation is *deterministic* for a given seed, so mock runs are repeatable
 * and the same externalId maps to the same posting on every sync.
 */

/** Small deterministic PRNG (mulberry32) — repeatable across runs. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function pickSome<T>(rng: () => number, items: readonly T[], min: number, max: number): T[] {
  const count = Math.min(items.length, min + Math.floor(rng() * (max - min + 1)));
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

const PRIVATE_TYPES: OpportunityType[] = [
  'FULL_TIME',
  'FULL_TIME',
  'FULL_TIME',
  'INTERNSHIP',
  'INTERNSHIP',
  'TRAINEE',
  'GRADUATE_PROGRAM',
  'OFF_CAMPUS_DRIVE',
  'WALK_IN',
  'HIRING_CHALLENGE',
  'PART_TIME',
  'CONTRACT',
];

function buildPrivateOpportunity(rng: () => number, index: number, now: Date): RawOpportunity {
  const company = pick(rng, MOCK_COMPANIES.filter((c) => c.type !== 'GOVERNMENT' && c.type !== 'PSU'));
  const template = pick(rng, MOCK_ROLES);
  const type = pick(rng, PRIVATE_TYPES);
  const isInternship = type === 'INTERNSHIP';
  const isFresherRole = ['TRAINEE', 'GRADUATE_PROGRAM', 'OFF_CAMPUS_DRIVE', 'WALK_IN'].includes(type);

  const workModeRoll = rng();
  const workMode = workModeRoll < 0.2 ? 'REMOTE' : workModeRoll < 0.5 ? 'HYBRID' : 'ONSITE';

  const locations =
    workMode === 'REMOTE'
      ? [{ city: undefined, state: undefined, country: 'India', isRemote: true }]
      : pickSome(rng, MOCK_CITIES, 1, 2).map((l) => ({
          city: l.city,
          state: l.state,
          country: 'India',
          isRemote: false,
        }));

  const currentYear = now.getFullYear();
  const graduationYears = isInternship
    ? [currentYear + 1, currentYear + 2]
    : isFresherRole
      ? [currentYear, currentYear + 1]
      : [];

  const minExperience = isInternship || isFresherRole ? 0 : Math.floor(rng() * 4);
  const maxExperience = isInternship || isFresherRole ? (isInternship ? 0 : 1) : minExperience + 2;

  const [salaryLo, salaryHi] = template.salaryBand;
  const salaryMin = roundTo(salaryLo + rng() * (salaryHi - salaryLo) * 0.4, 50_000);
  const salaryMax = roundTo(salaryMin + (salaryHi - salaryMin) * (0.3 + rng() * 0.5), 50_000);

  const [stipendLo, stipendHi] = template.stipendBand;
  const stipendMin = roundTo(stipendLo + rng() * (stipendHi - stipendLo) * 0.5, 1_000);
  const stipendMax = roundTo(stipendMin + (stipendHi - stipendMin) * 0.5, 1_000);

  const postedDaysAgo = Math.floor(rng() * 25);
  const deadlineDays = 3 + Math.floor(rng() * 45);

  const titlePrefix = isInternship ? `${pick(rng, ['Summer', 'Winter', '', ''])} `.trimStart() : '';
  const titleSuffix = isInternship
    ? ' Intern'
    : isFresherRole
      ? ` — ${type === 'GRADUATE_PROGRAM' ? 'Graduate Trainee' : 'Fresher'}`
      : '';
  const title = `${titlePrefix}${template.title}${titleSuffix}`.trim();

  const cgpa = rng() < 0.55 ? Number((6 + rng() * 2).toFixed(1)) : null;
  const backlogs = rng() < 0.5 ? 0 : null;

  const eligibilityText = [
    `Open to ${template.degrees.map((d) => d.replace(/_/g, '.')).join(' / ')} candidates.`,
    template.branches.includes('All Branches')
      ? 'All branches are eligible.'
      : `Eligible branches: ${template.branches.join(', ')}.`,
    graduationYears.length ? `${graduationYears.join(' and ')} batch only.` : '',
    cgpa != null ? `Minimum ${cgpa} CGPA required.` : '',
    backlogs === 0 ? 'No active backlogs at the time of joining.' : '',
    minExperience === 0 ? 'Freshers are welcome to apply.' : `${minExperience}–${maxExperience} years of experience required.`,
  ]
    .filter(Boolean)
    .join(' ');

  const description = [
    `${company.name} is hiring a ${title} to join the ${template.domain} team${
      workMode === 'REMOTE' ? ' remotely' : ` in ${locations[0]?.city ?? 'India'}`
    }.`,
    '',
    'About the role',
    `You will work alongside experienced engineers and analysts on problems that reach real users. This is a ${
      isInternship ? 'structured internship with mentorship and a defined project' : 'full ownership role from day one'
    }.`,
    '',
    'Responsibilities',
    ...template.responsibilities.map((r) => `• ${r}`),
    '',
    'Requirements',
    ...template.requirements.map((r) => `• ${r}`),
    '',
    'Eligibility',
    eligibilityText,
    '',
    'Selection process',
    '• Online assessment',
    '• Technical interview',
    '• Hiring manager discussion',
    isInternship ? '' : '• HR discussion',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return {
    externalId: `mock-private-${index}`,
    title,
    organizationName: company.name,
    sourceUrl: `${company.website}/careers/${index}`,
    applicationUrl: `${company.website}/careers/${index}/apply`,
    description,
    rawText: eligibilityText,
    opportunityType: type,
    industryHint: template.industry,
    domainHint: template.domain,
    role: template.role,
    skills: template.skills,
    locations,
    workMode,
    salaryMin: isInternship ? undefined : salaryMin,
    salaryMax: isInternship ? undefined : salaryMax,
    salaryCurrency: 'INR',
    salaryPeriod: isInternship ? undefined : 'YEAR',
    stipendMin: isInternship ? stipendMin : undefined,
    stipendMax: isInternship ? stipendMax : undefined,
    durationMonths: isInternship ? pick(rng, [2, 3, 6, 6, 12]) : undefined,
    postedDate: addDays(now, -postedDaysAgo),
    applicationDeadline: addDays(now, deadlineDays),
    eligibilityText,
    eligibility: {
      degrees: template.degrees as Degree[],
      branches: template.branches,
      graduationYears,
      ...(cgpa != null ? { minCgpa: cgpa } : {}),
      ...(backlogs != null ? { maxBacklogs: backlogs } : {}),
      minExperienceYears: minExperience,
      maxExperienceYears: maxExperience,
    },
    responsibilities: template.responsibilities,
    requirements: template.requirements,
    selectionProcess: ['Online assessment', 'Technical interview', 'Hiring manager discussion', 'HR discussion'],
    requiredDocuments: ['Updated resume', 'Degree marksheets', 'Government photo ID'],
    tags: [template.domain, company.type, isInternship ? 'Internship' : 'Job'],
    ppoAvailable: isInternship ? rng() < 0.5 : undefined,
    companyWebsite: company.website,
    companyType: company.type,
    companyHeadquarters: company.hq,
    companyEmployeeCount: company.size,
  };
}

function buildGovernmentOpportunity(rng: () => number, index: number, now: Date): RawOpportunity {
  const org = pick(rng, MOCK_COMPANIES.filter((c) => c.type === 'GOVERNMENT' || c.type === 'RESEARCH_ORGANIZATION'));
  const post = pick(rng, MOCK_GOVERNMENT_POSTS);
  const vacancies = 15 + Math.floor(rng() * 900);
  const startDays = -Math.floor(rng() * 10);
  const deadlineDays = 10 + Math.floor(rng() * 40);
  const minAge = 18 + Math.floor(rng() * 3);
  const maxAge = 27 + Math.floor(rng() * 8);
  const fee = `₹${pick(rng, [100, 200, 500, 750])}/- (no fee for SC/ST/PwBD/Women candidates as per the official notification)`;

  const eligibilityText = [
    `Educational qualification: ${post.degrees.map((d) => d.replace(/_/g, '.')).join(' or ')} from a recognised university.`,
    post.branches.includes('All Branches') ? 'Any discipline.' : `Discipline: ${post.branches.join(', ')}.`,
    `Age limit: ${minAge}–${maxAge} years as on the closing date, with relaxation as per government rules.`,
    'Candidate must be a citizen of India.',
  ].join(' ');

  const description = [
    `${org.name} invites online applications for the post of ${post.title}.`,
    '',
    `Number of vacancies: ${vacancies} (category-wise breakup is given in the official notification).`,
    '',
    'Eligibility',
    eligibilityText,
    '',
    'Selection process',
    '• Computer-based examination (Tier I)',
    '• Descriptive / skill test (Tier II)',
    '• Document verification',
    '• Medical examination',
    '',
    'Application fee',
    fee,
    '',
    'Candidates must read the official notification in full before applying. In case of any discrepancy, the official notification prevails.',
  ].join('\n');

  return {
    externalId: `mock-government-${index}`,
    title: `${post.title} Recruitment ${now.getFullYear()}`,
    organizationName: org.name,
    sourceUrl: `${org.website}/recruitment/${index}`,
    applicationUrl: `${org.website}/recruitment/${index}/apply`,
    description,
    rawText: eligibilityText,
    opportunityType: 'GOVERNMENT_JOB',
    governmentCategory: post.category,
    industryHint: org.industry,
    role: post.title,
    locations: [{ city: undefined, state: undefined, country: 'India', isRemote: false }],
    workMode: 'ONSITE',
    postedDate: addDays(now, startDays - 2),
    applicationStartDate: addDays(now, startDays),
    applicationDeadline: addDays(now, deadlineDays),
    examDate: addDays(now, deadlineDays + 45),
    vacancies,
    applicationFee: fee,
    eligibilityText,
    eligibility: {
      degrees: post.degrees as Degree[],
      branches: post.branches,
      graduationYears: [],
      minAge,
      maxAge,
      minExperienceYears: 0,
      citizenship: 'India',
    },
    selectionProcess: [
      'Computer-based examination (Tier I)',
      'Descriptive / skill test (Tier II)',
      'Document verification',
      'Medical examination',
    ],
    requiredDocuments: [
      'Matriculation certificate (date of birth proof)',
      'Degree certificate and marksheets',
      'Category certificate, if applicable',
      'Recent passport-size photograph and signature',
    ],
    tags: ['Government', post.category],
    companyWebsite: org.website,
    companyType: org.type,
    companyHeadquarters: org.hq,
    companyEmployeeCount: org.size,
  };
}

function buildPsuOpportunity(rng: () => number, index: number, now: Date): RawOpportunity {
  const org = pick(rng, MOCK_COMPANIES.filter((c) => c.type === 'PSU'));
  const post = pick(rng, MOCK_PSU_POSTS);
  const vacancies = 10 + Math.floor(rng() * 250);
  const deadlineDays = 12 + Math.floor(rng() * 35);
  const currentYear = now.getFullYear();
  const cgpa = Number((6.5 + rng() * 1.5).toFixed(1));

  const eligibilityText = [
    `Qualification: Full-time B.E./B.Tech in ${post.branches.join(' / ')} with a minimum of ${cgpa} CGPA (or 60% aggregate).`,
    post.gate
      ? `Selection is through a valid GATE ${currentYear} score in the relevant paper.`
      : 'Selection is through a written test conducted by the organisation followed by an interview.',
    `Age limit: 21–29 years as on the closing date, with relaxation as per government rules.`,
    'Candidate must be a citizen of India.',
  ].join(' ');

  const description = [
    `${org.name}, a Public Sector Undertaking, invites applications for the post of ${post.title}.`,
    '',
    `Vacancies: ${vacancies}`,
    '',
    'Eligibility',
    eligibilityText,
    '',
    'Selection process',
    post.gate ? '• GATE score shortlisting' : '• Written examination',
    '• Group discussion',
    '• Personal interview',
    '• Pre-employment medical examination',
    '',
    'Refer to the official notification on the organisation website for the complete terms.',
  ].join('\n');

  return {
    externalId: `mock-psu-${index}`,
    title: `${post.title} — ${currentYear}`,
    organizationName: org.name,
    sourceUrl: `${org.website}/careers/${index}`,
    applicationUrl: `${org.website}/careers/${index}/apply`,
    description,
    rawText: eligibilityText,
    opportunityType: 'PSU_JOB',
    psuCategory: post.category,
    governmentCategory: 'PSU',
    industryHint: org.industry,
    role: post.title,
    locations: pickSome(rng, MOCK_CITIES, 1, 2).map((l) => ({
      city: l.city,
      state: l.state,
      country: 'India',
      isRemote: false,
    })),
    workMode: 'ONSITE',
    salaryMin: 600_000,
    salaryMax: 1_200_000,
    salaryCurrency: 'INR',
    salaryPeriod: 'YEAR',
    postedDate: addDays(now, -Math.floor(rng() * 12)),
    applicationDeadline: addDays(now, deadlineDays),
    vacancies,
    gateRequired: post.gate,
    eligibilityText,
    eligibility: {
      degrees: ['B_TECH', 'B_E'] as Degree[],
      branches: post.branches,
      graduationYears: [currentYear, currentYear - 1],
      minCgpa: cgpa,
      minAge: 21,
      maxAge: 29,
      minExperienceYears: 0,
      maxExperienceYears: 2,
      citizenship: 'India',
    },
    selectionProcess: [
      post.gate ? 'GATE score shortlisting' : 'Written examination',
      'Group discussion',
      'Personal interview',
      'Pre-employment medical examination',
    ],
    requiredDocuments: ['GATE scorecard, if applicable', 'Degree certificate', 'Category certificate, if applicable'],
    tags: ['PSU', post.category, ...(post.gate ? ['GATE'] : [])],
    companyWebsite: org.website,
    companyType: org.type,
    companyHeadquarters: org.hq,
    companyEmployeeCount: org.size,
  };
}

function buildGovernmentInternship(rng: () => number, index: number, now: Date): RawOpportunity {
  const org = pick(rng, MOCK_COMPANIES.filter((c) => c.type === 'GOVERNMENT' || c.type === 'RESEARCH_ORGANIZATION'));
  const durationMonths = pick(rng, [2, 3, 6]);
  const stipend = pick(rng, [8_000, 10_000, 12_000, 15_000]);
  const currentYear = now.getFullYear();

  const eligibilityText = `Open to students currently pursuing a Bachelor's or Master's degree in any discipline, graduating in ${currentYear} or ${currentYear + 1}. Minimum 60% aggregate. Candidate must be a citizen of India.`;

  return {
    externalId: `mock-gov-internship-${index}`,
    title: `Research Internship Programme — ${pick(rng, ['Policy', 'Data', 'Engineering', 'Public Health'])}`,
    organizationName: org.name,
    sourceUrl: `${org.website}/internships/${index}`,
    applicationUrl: `${org.website}/internships/${index}/apply`,
    description: [
      `${org.name} offers a ${durationMonths}-month internship for students interested in public-sector research.`,
      '',
      'Interns are attached to a division and work on a defined research question under a mentor, ending with a written report.',
      '',
      'Eligibility',
      eligibilityText,
      '',
      `Stipend: ₹${stipend.toLocaleString('en-IN')} per month.`,
    ].join('\n'),
    rawText: eligibilityText,
    opportunityType: 'GOVERNMENT_INTERNSHIP',
    internshipCategory: 'Government',
    industryHint: org.industry,
    role: 'Research Intern',
    locations: [{ city: 'New Delhi', state: 'Delhi', country: 'India', isRemote: false }],
    workMode: 'ONSITE',
    stipendMin: stipend,
    stipendMax: stipend,
    durationMonths,
    postedDate: addDays(now, -Math.floor(rng() * 15)),
    applicationDeadline: addDays(now, 15 + Math.floor(rng() * 30)),
    eligibilityText,
    eligibility: {
      degrees: ['B_TECH', 'B_A', 'B_SC', 'B_COM', 'M_A', 'M_SC', 'MBA'] as Degree[],
      branches: ['All Branches'],
      graduationYears: [currentYear, currentYear + 1],
      minPercentage: 60,
      minExperienceYears: 0,
      maxExperienceYears: 0,
      citizenship: 'India',
    },
    selectionProcess: ['Application shortlisting', 'Statement of purpose review', 'Interview'],
    requiredDocuments: ['Bonafide certificate from the institute', 'Latest marksheet', 'Statement of purpose'],
    tags: ['Government', 'Internship', 'Research'],
    companyWebsite: org.website,
    companyType: org.type,
    companyHeadquarters: org.hq,
    companyEmployeeCount: org.size,
  };
}

export const mockConnector: Connector = {
  kind: 'MOCK',
  accessPolicy:
    'Generates synthetic sample data locally. Makes no network requests and represents no real employer or posting.',

  async fetch(ctx: ConnectorContext): Promise<RawOpportunity[]> {
    const config = ctx.config as { count?: number; seed?: number };
    const total = Math.min(config.count ?? 120, 1000);
    const rng = makeRandom(config.seed ?? 20260819);
    const now = new Date();

    const out: RawOpportunity[] = [];

    // Roughly the mix a student actually sees: mostly private, with a
    // meaningful government/PSU tail.
    const privateCount = Math.round(total * 0.62);
    const governmentCount = Math.round(total * 0.18);
    const psuCount = Math.round(total * 0.12);
    const govInternCount = total - privateCount - governmentCount - psuCount;

    for (let i = 0; i < privateCount; i += 1) out.push(buildPrivateOpportunity(rng, i, now));
    for (let i = 0; i < governmentCount; i += 1) out.push(buildGovernmentOpportunity(rng, i, now));
    for (let i = 0; i < psuCount; i += 1) out.push(buildPsuOpportunity(rng, i, now));
    for (let i = 0; i < govInternCount; i += 1) out.push(buildGovernmentInternship(rng, i, now));

    ctx.log('info', `generated ${out.length} mock opportunities`, {
      private: privateCount,
      government: governmentCount,
      psu: psuCount,
      governmentInternships: govInternCount,
    });

    return out;
  },
};
