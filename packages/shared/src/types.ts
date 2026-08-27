import type {
  ApplicationStatus,
  CompanyType,
  Degree,
  EligibilityVerdict,
  NotificationFrequency,
  NotificationType,
  OpportunityStatus,
  OpportunityType,
  SourceKind,
  SourceTrustLevel,
  UserRole,
  WorkMode,
} from './taxonomy';

/* ------------------------------------------------------------------ *
 * API envelope
 * ------------------------------------------------------------------ */

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Opaque cursor for keyset pagination on large result sets. */
  nextCursor?: string | null;
}

/* ------------------------------------------------------------------ *
 * Auth & user
 * ------------------------------------------------------------------ */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  hasProfile: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface EducationDto {
  id?: string;
  degree: Degree;
  branch: string | null;
  university: string | null;
  college: string | null;
  graduationYear: number | null;
  currentYear: number | null;
  cgpa: number | null;
  percentage: number | null;
  backlogs: number | null;
  isPrimary: boolean;
}

export interface ExperienceDto {
  id?: string;
  kind: 'INTERNSHIP' | 'JOB' | 'PROJECT' | 'FREELANCE';
  title: string;
  organization: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  skills: string[];
}

export interface PreferencesDto {
  desiredRoles: string[];
  desiredIndustries: string[];
  preferredLocations: string[];
  remotePreference: WorkMode | 'ANY';
  minSalaryExpectation: number | null;
  opportunityPreference: 'INTERNSHIP' | 'FULL_TIME' | 'ANY';
  sectorPreference: 'GOVERNMENT' | 'PRIVATE' | 'ANY';
  willingToRelocate: boolean;
}

export interface UserProfileDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  headline: string | null;
  yearsOfExperience: number;
  dateOfBirth: string | null;
  skills: string[];
  education: EducationDto[];
  experience: ExperienceDto[];
  preferences: PreferencesDto;
  profileCompletion: number;
  resumeId: string | null;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Opportunities
 * ------------------------------------------------------------------ */

export interface OpportunityEligibilityDto {
  degrees: Degree[];
  branches: string[];
  graduationYears: number[];
  minCgpa: number | null;
  minPercentage: number | null;
  maxBacklogs: number | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  minAge: number | null;
  maxAge: number | null;
  /** Only stored when the *official* posting specifies it. */
  genderRequirement: string | null;
  citizenship: string | null;
  workAuthorization: string | null;
  /** Free-text eligibility exactly as published by the source. */
  rawText: string | null;
}

export interface OpportunityLocationDto {
  city: string | null;
  state: string | null;
  country: string | null;
  isRemote: boolean;
}

export interface OpportunitySourceRefDto {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  trustLevel: SourceTrustLevel;
  isPrimary: boolean;
  lastVerifiedAt: string | null;
}

export interface CompanySummaryDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  industry: string | null;
  companyType: CompanyType | null;
  website: string | null;
  isFollowed?: boolean;
}

export interface OpportunitySummaryDto {
  id: string;
  slug: string;
  title: string;
  company: CompanySummaryDto | null;
  organizationName: string;
  opportunityType: OpportunityType;
  industry: string | null;
  domain: string | null;
  role: string | null;
  skills: string[];
  locations: OpportunityLocationDto[];
  locationLabel: string;
  workMode: WorkMode;
  experienceLabel: string;
  educationLabel: string;
  salaryLabel: string;
  stipendLabel: string | null;
  durationLabel: string | null;
  applicationDeadline: string | null;
  postedDate: string | null;
  lastVerifiedAt: string | null;
  status: OpportunityStatus;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  applicationUrl: string;
  trustLevel: SourceTrustLevel;
  sourceCount: number;
  fraudFlags: string[];
  /** Present only for authenticated requests. */
  match?: MatchScoreDto;
  eligibility?: EligibilitySummaryDto;
  isSaved?: boolean;
  applicationStatus?: ApplicationStatus | null;
}

export interface OpportunityDetailDto extends OpportunitySummaryDto {
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferredSkills: string[];
  selectionProcess: string[];
  requiredDocuments: string[];
  importantDates: { label: string; date: string | null }[];
  eligibilityDetail: OpportunityEligibilityDto;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string | null;
  stipendMin: number | null;
  stipendMax: number | null;
  durationMonths: number | null;
  applicationStartDate: string | null;
  vacancies: number | null;
  applicationFee: string | null;
  examDate: string | null;
  governmentCategory: string | null;
  psuCategory: string | null;
  gateRequired: boolean | null;
  ppoAvailable: boolean | null;
  sources: OpportunitySourceRefDto[];
  company: CompanySummaryDto | null;
  seo: {
    title: string;
    description: string;
    canonicalUrl: string;
    jsonLd: Record<string, unknown>;
  };
}

/* ------------------------------------------------------------------ *
 * Matching & eligibility
 * ------------------------------------------------------------------ */

export interface MatchComponentDto {
  key: 'eligibility' | 'skills' | 'education' | 'location' | 'experience' | 'preferences';
  label: string;
  score: number;
  weight: number;
  explanation: string;
}

export interface MatchScoreDto {
  overall: number;
  components: MatchComponentDto[];
  matchedSkills: string[];
  missingSkills: string[];
  computedAt: string;
}

/**
 * How far a failed criterion is from being met, when that distance is
 * meaningful. Present only on `failed` checks that have a measurable gap —
 * it powers the near-miss view, which turns "not eligible" into "you miss
 * this by 0.2 CGPA".
 */
export interface EligibilityGapDto {
  /** What the posting asks for, formatted for display. */
  required: string;
  /** What the profile currently holds. */
  actual: string;
  /**
   * Distance from eligibility, normalised so gaps of the same kind can be
   * ranked. Null when the gap is categorical (a branch, a citizenship).
   */
  shortfall: number | null;
  /** Unit for `shortfall`, e.g. "CGPA", "%", "years", "backlogs". */
  unit: string | null;
  /** True when the user could plausibly close this gap. */
  closable: boolean;
}

export interface EligibilityCheckDto {
  key: string;
  label: string;
  passed: boolean | null;
  /** `null` = could not be determined from the posting or the profile. */
  message: string;
  gap?: EligibilityGapDto;
  /**
   * For an `unknown` check: the profile field that would resolve it.
   * Drives the "add this one thing to unlock N opportunities" prompt.
   */
  resolvedBy?: ProfileFieldKey;
}

/** Profile fields the eligibility engine can be blocked on. */
export type ProfileFieldKey =
  | 'education.degree'
  | 'education.branch'
  | 'education.graduationYear'
  | 'education.cgpa'
  | 'education.percentage'
  | 'education.backlogs'
  | 'profile.dateOfBirth'
  | 'profile.country'
  | 'profile.yearsOfExperience';

export interface EligibilitySummaryDto {
  verdict: EligibilityVerdict;
  score: number;
  passed: EligibilityCheckDto[];
  failed: EligibilityCheckDto[];
  warnings: EligibilityCheckDto[];
  unknown: EligibilityCheckDto[];
}

export interface SkillGapDto {
  opportunityId?: string;
  targetRole?: string;
  matchPercent: number;
  haveSkills: string[];
  missingSkills: string[];
  recommendedLearning: { skill: string; reason: string; priority: number }[];
}

export interface CareerReadinessDto {
  overall: number;
  breakdown: { key: string; label: string; score: number; weight: number; hint: string }[];
  updatedAt: string;
}

export interface CareerRecommendationDto {
  roles: { name: string; score: number; reason: string }[];
  skills: { name: string; reason: string }[];
  industries: { name: string; score: number }[];
  companies: CompanySummaryDto[];
  certifications: { name: string; reason: string }[];
  projects: { name: string; reason: string }[];
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

export interface OpportunityFilters {
  q?: string;
  types?: OpportunityType[];
  industries?: string[];
  domains?: string[];
  skills?: string[];
  companyIds?: string[];
  workModes?: WorkMode[];
  cities?: string[];
  states?: string[];
  countries?: string[];
  degrees?: Degree[];
  branches?: string[];
  graduationYears?: number[];
  experienceBands?: string[];
  minSalary?: number;
  maxSalary?: number;
  deadlineWithinDays?: number;
  postedWithinDays?: number;
  statuses?: OpportunityStatus[];
  governmentCategories?: string[];
  psuCategories?: string[];
  internshipCategories?: string[];
  companyTypes?: CompanyType[];
  eligibleOnly?: boolean;
  minMatchScore?: number;
  sort?: 'relevance' | 'deadline' | 'newest' | 'match' | 'salary';
  page?: number;
  pageSize?: number;
  cursor?: string;
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface OpportunitySearchResponse extends Paginated<OpportunitySummaryDto> {
  facets: {
    types: FacetBucket[];
    industries: FacetBucket[];
    domains: FacetBucket[];
    workModes: FacetBucket[];
    cities: FacetBucket[];
    companyTypes: FacetBucket[];
    skills: FacetBucket[];
  };
  /** Filters the natural-language parser inferred from a free-text query. */
  interpretedFilters?: Partial<OpportunityFilters>;
  interpretation?: string;
}

/* ------------------------------------------------------------------ *
 * Applications & tracking
 * ------------------------------------------------------------------ */

export interface ApplicationEventDto {
  id: string;
  status: ApplicationStatus;
  note: string | null;
  occurredAt: string;
}

export interface ApplicationDto {
  id: string;
  opportunity: OpportunitySummaryDto;
  status: ApplicationStatus;
  notes: string | null;
  appliedAt: string | null;
  interviewDate: string | null;
  followUpDate: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  recruiterPhone: string | null;
  referenceNumber: string | null;
  documents: string[];
  events: ApplicationEventDto[];
  createdAt: string;
  updatedAt: string;
}

export interface DeadlineGroupDto {
  bucket: string;
  label: string;
  items: OpportunitySummaryDto[];
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferencesDto {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  browserEnabled: boolean;
  frequency: NotificationFrequency;
  newMatches: boolean;
  savedSearches: boolean;
  deadlineReminders: boolean;
  followedCompanies: boolean;
  applicationFollowUps: boolean;
  governmentAlerts: boolean;
  deadlineLeadDays: number;
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export interface DashboardDto {
  greeting: string;
  user: { name: string; profileCompletion: number };
  stats: {
    matchingOpportunities: number;
    newToday: number;
    deadlinesToday: number;
    activeApplications: number;
    savedCount: number;
  };
  recommended: OpportunitySummaryDto[];
  closingSoon: OpportunitySummaryDto[];
  activeApplications: ApplicationDto[];
  recommendedSkills: { name: string; reason: string }[];
  readiness: CareerReadinessDto;
}

/* ------------------------------------------------------------------ *
 * Ingestion / admin
 * ------------------------------------------------------------------ */

export interface SourceConnectorDto {
  id: string;
  name: string;
  slug: string;
  kind: SourceKind;
  trustLevel: SourceTrustLevel;
  baseUrl: string | null;
  enabled: boolean;
  scheduleCron: string | null;
  rateLimitPerMinute: number;
  respectsRobotsTxt: boolean;
  lastSyncAt: string | null;
  lastStatus: string | null;
  config: Record<string, unknown>;
  stats: {
    fetched: number;
    created: number;
    updated: number;
    expired: number;
    failed: number;
    duplicates: number;
  };
}

export interface IngestionJobDto {
  id: string;
  sourceId: string;
  sourceName: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsExpired: number;
  recordsDuplicate: number;
  recordsFailed: number;
  errorMessage: string | null;
}

export interface AdminAnalyticsDto {
  totals: {
    opportunities: number;
    activeOpportunities: number;
    newToday: number;
    newThisWeek: number;
    expiringSoon: number;
    users: number;
    companies: number;
    applications: number;
  };
  byIndustry: { name: string; count: number }[];
  byDomain: { name: string; count: number }[];
  byLocation: { name: string; count: number }[];
  byType: { name: string; count: number }[];
  governmentVsPrivate: { name: string; count: number }[];
  internshipVsFullTime: { name: string; count: number }[];
  topCompanies: { name: string; count: number }[];
  topSkills: { name: string; count: number }[];
  ingestionHealth: { sourceName: string; status: string; lastSyncAt: string | null }[];
}

export interface UserAnalyticsDto {
  applications: number;
  saved: number;
  interviews: number;
  offers: number;
  rejections: number;
  responseRatePercent: number;
  successRatePercent: number;
  byStatus: { status: ApplicationStatus; count: number }[];
  topSkillGaps: { skill: string; count: number }[];
  applicationsOverTime: { date: string; count: number }[];
}

/* ------------------------------------------------------------------ *
 * AI assistant
 * ------------------------------------------------------------------ */

export interface AssistantCitation {
  opportunityId: string;
  title: string;
  organization: string;
  eligibility: string;
  deadline: string;
  sourceName: string;
  applicationUrl: string;
}

export interface AssistantMessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: AssistantCitation[];
  createdAt: string;
}

export interface AssistantReplyDto {
  conversationId: string;
  message: AssistantMessageDto;
  /** Filters the assistant applied when it queried the opportunity database. */
  usedFilters?: Partial<OpportunityFilters>;
}

/* ------------------------------------------------------------------ *
 * Profile unlocks (one missing field can block many opportunities)
 * ------------------------------------------------------------------ */

export interface ProfileUnlockDto {
  field: ProfileFieldKey;
  label: string;
  /** What to ask the user, in their own terms. */
  prompt: string;
  /** Why it matters, phrased as the payoff. */
  detail: string;
  /** How many opportunities this field alone would resolve. */
  blockedCount: number;
  /** Where in the app to go and fix it. */
  href: string;
  /** Sample of the opportunities being held up. */
  examples: { id: string; slug: string; title: string; organizationName: string }[];
}

export interface ProfileUnlocksDto {
  /** Opportunities whose eligibility could not be decided. */
  unresolvedCount: number;
  /** Of the candidate set that was examined. */
  examinedCount: number;
  unlocks: ProfileUnlockDto[];
}

/* ------------------------------------------------------------------ *
 * Near misses
 * ------------------------------------------------------------------ */

export interface NearMissItemDto {
  opportunity: OpportunitySummaryDto;
  reason: string;
  gap: EligibilityGapDto;
}

export interface NearMissGroupDto {
  key: string;
  /** e.g. "Just short on CGPA" */
  title: string;
  /** e.g. "Raising your CGPA to 7.0 would open 8 more opportunities." */
  advice: string;
  closable: boolean;
  items: NearMissItemDto[];
}

export interface NearMissesDto {
  examinedCount: number;
  ineligibleCount: number;
  groups: NearMissGroupDto[];
}

/* ------------------------------------------------------------------ *
 * Saved searches & alerts
 * ------------------------------------------------------------------ */

export interface SavedSearchDto {
  id: string;
  name: string;
  /** The original natural-language query, when there was one. */
  query: string | null;
  filters: Partial<OpportunityFilters>;
  /** Human-readable summary of what this search watches. */
  description: string;
  alertsEnabled: boolean;
  frequency: NotificationFrequency;
  matchCount: number;
  newSinceLastRun: number;
  lastRunAt: string | null;
  lastNotifiedAt: string | null;
  createdAt: string;
}
