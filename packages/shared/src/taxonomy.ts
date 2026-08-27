/**
 * Controlled vocabularies shared by the API, the workers and the web app.
 *
 * Industries and domains are *seeded* from this file but stored in the
 * database, so administrators can add new ones at runtime without a code
 * change (see requirement: "administrators can add new domains without
 * changing application code").
 */

export const OPPORTUNITY_TYPES = [
  'INTERNSHIP',
  'FULL_TIME',
  'PART_TIME',
  'APPRENTICESHIP',
  'TRAINEE',
  'GRADUATE_PROGRAM',
  'WALK_IN',
  'OFF_CAMPUS_DRIVE',
  'HIRING_CHALLENGE',
  'GOVERNMENT_JOB',
  'PSU_JOB',
  'GOVERNMENT_INTERNSHIP',
  'RESEARCH_OPPORTUNITY',
  'FELLOWSHIP',
  'CONTRACT',
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  INTERNSHIP: 'Internship',
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  APPRENTICESHIP: 'Apprenticeship',
  TRAINEE: 'Trainee',
  GRADUATE_PROGRAM: 'Graduate Program',
  WALK_IN: 'Walk-in Interview',
  OFF_CAMPUS_DRIVE: 'Off-Campus Drive',
  HIRING_CHALLENGE: 'Hiring Challenge',
  GOVERNMENT_JOB: 'Government Job',
  PSU_JOB: 'PSU Job',
  GOVERNMENT_INTERNSHIP: 'Government Internship',
  RESEARCH_OPPORTUNITY: 'Research Opportunity',
  FELLOWSHIP: 'Fellowship',
  CONTRACT: 'Contract',
};

/** Types that belong to the dedicated Government module. */
export const GOVERNMENT_TYPES: OpportunityType[] = [
  'GOVERNMENT_JOB',
  'GOVERNMENT_INTERNSHIP',
  'APPRENTICESHIP',
];
/** Types that belong to the dedicated PSU module. */
export const PSU_TYPES: OpportunityType[] = ['PSU_JOB'];
/** Types that belong to the dedicated Internship module. */
export const INTERNSHIP_TYPES: OpportunityType[] = [
  'INTERNSHIP',
  'GOVERNMENT_INTERNSHIP',
  'RESEARCH_OPPORTUNITY',
];
/** Types surfaced on the fresher / off-campus dashboard. */
export const FRESHER_TYPES: OpportunityType[] = [
  'FULL_TIME',
  'TRAINEE',
  'GRADUATE_PROGRAM',
  'OFF_CAMPUS_DRIVE',
  'WALK_IN',
  'HIRING_CHALLENGE',
  'APPRENTICESHIP',
];

export const WORK_MODES = ['REMOTE', 'ONSITE', 'HYBRID', 'NOT_SPECIFIED'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const OPPORTUNITY_STATUSES = [
  'VERIFIED',
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'UNVERIFIED',
  'REMOVED',
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

/** Statuses that a public visitor is allowed to see. */
export const PUBLIC_STATUSES: OpportunityStatus[] = [
  'VERIFIED',
  'ACTIVE',
  'EXPIRING_SOON',
  'UNVERIFIED',
];

export const APPLICATION_STATUSES = [
  'SAVED',
  'INTERESTED',
  'APPLIED',
  'ASSESSMENT',
  'INTERVIEW',
  'TECHNICAL_INTERVIEW',
  'HR_INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: 'Saved',
  INTERESTED: 'Interested',
  APPLIED: 'Applied',
  ASSESSMENT: 'Assessment',
  INTERVIEW: 'Interview',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  HR_INTERVIEW: 'HR Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

/** Ordered pipeline used by the application tracker board. */
export const APPLICATION_PIPELINE: ApplicationStatus[] = [
  'SAVED',
  'INTERESTED',
  'APPLIED',
  'ASSESSMENT',
  'INTERVIEW',
  'TECHNICAL_INTERVIEW',
  'HR_INTERVIEW',
  'OFFER',
];

/** Terminal states that leave the forward pipeline. */
export const APPLICATION_TERMINAL: ApplicationStatus[] = ['REJECTED', 'WITHDRAWN'];

export const COMPANY_TYPES = [
  'STARTUP',
  'MNC',
  'PRODUCT',
  'SERVICE',
  'GOVERNMENT',
  'PSU',
  'NGO',
  'RESEARCH_ORGANIZATION',
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const EXPERIENCE_BANDS = [
  { id: 'FRESHER', label: 'Fresher', minYears: 0, maxYears: 0 },
  { id: 'ZERO_ONE', label: '0–1 years', minYears: 0, maxYears: 1 },
  { id: 'ONE_TWO', label: '1–2 years', minYears: 1, maxYears: 2 },
  { id: 'TWO_FIVE', label: '2–5 years', minYears: 2, maxYears: 5 },
  { id: 'FIVE_PLUS', label: '5+ years', minYears: 5, maxYears: null },
] as const;
export type ExperienceBandId = (typeof EXPERIENCE_BANDS)[number]['id'];

export const DEGREES = [
  'DIPLOMA',
  'ITI',
  'B_TECH',
  'B_E',
  'B_SC',
  'B_COM',
  'B_A',
  'BCA',
  'BBA',
  'B_PHARM',
  'MBBS',
  'M_TECH',
  'M_E',
  'M_SC',
  'M_COM',
  'M_A',
  'MCA',
  'MBA',
  'PGDM',
  'PHD',
  'OTHER',
] as const;
export type Degree = (typeof DEGREES)[number];

export const DEGREE_LABELS: Record<Degree, string> = {
  DIPLOMA: 'Diploma',
  ITI: 'ITI',
  B_TECH: 'B.Tech',
  B_E: 'B.E.',
  B_SC: 'B.Sc.',
  B_COM: 'B.Com.',
  B_A: 'B.A.',
  BCA: 'BCA',
  BBA: 'BBA',
  B_PHARM: 'B.Pharm',
  MBBS: 'MBBS',
  M_TECH: 'M.Tech',
  M_E: 'M.E.',
  M_SC: 'M.Sc.',
  M_COM: 'M.Com.',
  M_A: 'M.A.',
  MCA: 'MCA',
  MBA: 'MBA',
  PGDM: 'PGDM',
  PHD: 'PhD',
  OTHER: 'Other',
};

/**
 * Degrees that are treated as interchangeable by the eligibility engine.
 * A B.E. holder is eligible for a B.Tech-only posting and vice versa.
 */
export const DEGREE_EQUIVALENCE: Degree[][] = [
  ['B_TECH', 'B_E'],
  ['M_TECH', 'M_E'],
  ['MBA', 'PGDM'],
];

/** Degrees that satisfy a postgraduate requirement. */
export const POSTGRADUATE_DEGREES: Degree[] = [
  'M_TECH',
  'M_E',
  'M_SC',
  'M_COM',
  'M_A',
  'MCA',
  'MBA',
  'PGDM',
  'PHD',
];

export const USER_ROLES = ['STUDENT', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SOURCE_KINDS = [
  'MOCK',
  'RSS',
  'JSON_API',
  'GREENHOUSE',
  'LEVER',
  'GOVERNMENT_FEED',
  'MANUAL',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_TRUST_LEVELS = ['OFFICIAL', 'PARTNER', 'THIRD_PARTY'] as const;
export type SourceTrustLevel = (typeof SOURCE_TRUST_LEVELS)[number];

export const INGESTION_STATUSES = ['PENDING', 'RUNNING', 'SUCCESS', 'WARNING', 'FAILED'] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export const ELIGIBILITY_VERDICTS = ['ELIGIBLE', 'NOT_ELIGIBLE', 'NEEDS_REVIEW'] as const;
export type EligibilityVerdict = (typeof ELIGIBILITY_VERDICTS)[number];

export const NOTIFICATION_TYPES = [
  'NEW_MATCHES',
  'SAVED_SEARCH',
  'DEADLINE_REMINDER',
  'FOLLOWED_COMPANY',
  'APPLICATION_FOLLOW_UP',
  'GOVERNMENT_MATCH',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_FREQUENCIES = ['REALTIME', 'DAILY', 'WEEKLY', 'NEVER'] as const;
export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];

export const DEADLINE_BUCKETS = [
  { id: 'TODAY', label: 'Closing Today', days: 0 },
  { id: 'TOMORROW', label: 'Closing Tomorrow', days: 1 },
  { id: 'THREE_DAYS', label: 'Closing in 3 Days', days: 3 },
  { id: 'THIS_WEEK', label: 'Closing This Week', days: 7 },
  { id: 'THIRTY_DAYS', label: 'Closing in 30 Days', days: 30 },
] as const;
export type DeadlineBucketId = (typeof DEADLINE_BUCKETS)[number]['id'];

/** Placeholder used everywhere instead of guessing a missing value. */
export const NOT_SPECIFIED = 'Not Specified';
