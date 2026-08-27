import type {
  AdminAnalyticsDto,
  ApplicationDto,
  AssistantReplyDto,
  AuthResponse,
  AuthUser,
  CareerReadinessDto,
  CareerRecommendationDto,
  DashboardDto,
  DeadlineGroupDto,
  NearMissesDto,
  NotificationDto,
  NotificationPreferencesDto,
  ProfileUnlocksDto,
  SavedSearchDto,
  OpportunityDetailDto,
  OpportunityFilters,
  OpportunitySearchResponse,
  Paginated,
  SkillGapDto,
  UserAnalyticsDto,
  UserProfileDto,
} from '@odp/shared';

/**
 * Typed API client.
 *
 * Works in both runtimes: server components pass a token explicitly, browser
 * code reads it from localStorage. There is one place that builds a request, so
 * auth, error shape and base URL never diverge.
 */

const SERVER_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000';
const BROWSER_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export const ACCESS_TOKEN_KEY = 'odp.accessToken';
export const REFRESH_TOKEN_KEY = 'odp.refreshToken';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function baseUrl(): string {
  return typeof window === 'undefined' ? SERVER_BASE : BROWSER_BASE;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeSession(auth: AuthResponse): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, auth.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, auth.refreshToken);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Explicit token, for server components that read cookies themselves. */
  token?: string | null;
  /** Next.js caching hints for server-side fetches. */
  revalidate?: number;
  tags?: string[];
  /** Abort after this many ms. Prevents a slow API stalling a page render. */
  timeoutMs?: number;
}

/**
 * Server-side renders (including static generation at build time) must never
 * block indefinitely on the API, so they carry a shorter default budget than
 * an interactive browser request.
 */
const DEFAULT_TIMEOUT_MS = typeof window === 'undefined' ? 10_000 : 30_000;

let refreshInFlight: Promise<boolean> | null = null;

/** Exchanges the refresh token for a new access token, once at a time. */
async function refreshSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  refreshInFlight ??= (async () => {
    const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${BROWSER_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearSession();
        return false;
      }
      storeSession((await res.json()) as AuthResponse);
      return true;
    } catch {
      return false;
    } finally {
      // Allow a later 401 to trigger a fresh attempt.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, token, revalidate, tags, headers, timeoutMs, ...init } = options;
  const authToken = token !== undefined ? token : getStoredToken();

  const doFetch = async (bearer: string | null): Promise<Response> =>
    fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(headers as Record<string, string> | undefined),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
      ...(revalidate !== undefined || tags
        ? { next: { ...(revalidate !== undefined ? { revalidate } : {}), ...(tags ? { tags } : {}) } }
        : { cache: init.cache ?? 'no-store' }),
    });

  let res = await doFetch(authToken);

  // One transparent retry after refreshing an expired access token.
  if (res.status === 401 && typeof window !== 'undefined' && token === undefined) {
    if (await refreshSession()) {
      res = await doFetch(getStoredToken());
    }
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const error = (payload as { error?: { code: string; message: string; details?: unknown } })?.error;
    throw new ApiError(
      res.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? `Request failed with ${res.status}`,
      error?.details,
    );
  }

  return payload as T;
}

/** Serialises filters into the query-string shape the API expects. */
export function toQuery(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/* ------------------------------------------------------------------ *
 * Endpoint helpers
 * ------------------------------------------------------------------ */

export const api = {
  auth: {
    register: (body: { name: string; email: string; password: string }) =>
      apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body }),
    login: (body: { email: string; password: string }) =>
      apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body }),
    me: (token?: string | null) => apiFetch<AuthUser>('/api/auth/me', { token }),
    logout: (refreshToken: string) =>
      apiFetch<void>('/api/auth/logout', { method: 'POST', body: { refreshToken } }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      apiFetch<void>('/api/auth/change-password', { method: 'POST', body }),
  },

  profile: {
    get: (token?: string | null) => apiFetch<UserProfileDto>('/api/profile', { token }),
    update: (body: unknown) => apiFetch<UserProfileDto>('/api/profile', { method: 'PUT', body }),
    addSkills: (skills: string[]) =>
      apiFetch<UserProfileDto>('/api/profile/skills', { method: 'POST', body: { skills } }),
    deleteAccount: () => apiFetch<void>('/api/profile/account', { method: 'DELETE' }),
  },

  opportunities: {
    search: (filters: Partial<OpportunityFilters> & { nl?: boolean }, token?: string | null) =>
      apiFetch<OpportunitySearchResponse>(`/api/opportunities${toQuery(filters)}`, { token }),
    module: (
      module: 'internships' | 'government' | 'psu' | 'freshers',
      filters: Partial<OpportunityFilters>,
      token?: string | null,
    ) => apiFetch<OpportunitySearchResponse>(`/api/opportunities/${module}${toQuery(filters)}`, { token }),
    get: (slugOrId: string, token?: string | null) =>
      apiFetch<OpportunityDetailDto>(`/api/opportunities/${slugOrId}`, { token }),
    deadlines: (savedOnly = false, token?: string | null) =>
      apiFetch<DeadlineGroupDto[]>(`/api/opportunities/deadlines${savedOnly ? '?savedOnly=true' : ''}`, { token }),
    counts: () => apiFetch<Record<string, number>>('/api/opportunities/counts', { revalidate: 300 }),
  },

  companies: {
    list: (filters: Record<string, unknown>, token?: string | null) =>
      apiFetch<Paginated<Record<string, unknown>>>(`/api/companies${toQuery(filters)}`, { token }),
    get: (slugOrId: string, token?: string | null) =>
      apiFetch<Record<string, unknown>>(`/api/companies/${slugOrId}`, { token }),
    follow: (id: string) => apiFetch<void>(`/api/companies/${id}/follow`, { method: 'POST' }),
    unfollow: (id: string) => apiFetch<void>(`/api/companies/${id}/follow`, { method: 'DELETE' }),
    following: (token?: string | null) => apiFetch<unknown[]>('/api/companies/following', { token }),
  },

  applications: {
    list: (filters: Record<string, unknown> = {}, token?: string | null) =>
      apiFetch<Paginated<ApplicationDto>>(`/api/applications${toQuery(filters)}`, { token }),
    pipeline: (token?: string | null) =>
      apiFetch<{ status: string; label: string; items: ApplicationDto[] }[]>('/api/applications/pipeline', { token }),
    create: (body: { opportunityId: string; status?: string; notes?: string }) =>
      apiFetch<ApplicationDto>('/api/applications', { method: 'POST', body }),
    update: (id: string, body: unknown) =>
      apiFetch<ApplicationDto>(`/api/applications/${id}`, { method: 'PATCH', body }),
    remove: (id: string) => apiFetch<void>(`/api/applications/${id}`, { method: 'DELETE' }),
    analytics: (token?: string | null) => apiFetch<UserAnalyticsDto>('/api/applications/analytics', { token }),
  },

  saved: {
    list: (token?: string | null) => apiFetch<Paginated<unknown>>('/api/saved', { token }),
    add: (opportunityId: string) => apiFetch<void>('/api/saved', { method: 'POST', body: { opportunityId } }),
    remove: (opportunityId: string) => apiFetch<void>(`/api/saved/${opportunityId}`, { method: 'DELETE' }),
  },

  dashboard: {
    get: (token?: string | null) => apiFetch<DashboardDto>('/api/dashboard', { token }),
    readiness: (token?: string | null) => apiFetch<CareerReadinessDto>('/api/dashboard/readiness', { token }),
    skillGap: (opportunityId?: string, token?: string | null) =>
      apiFetch<SkillGapDto>(`/api/dashboard/skill-gap${opportunityId ? `?opportunityId=${opportunityId}` : ''}`, { token }),
    recommendations: (token?: string | null) =>
      apiFetch<CareerRecommendationDto>('/api/dashboard/recommendations', { token }),
    /** Which single profile field would resolve the most "we cannot tell" verdicts. */
    unlocks: (token?: string | null) => apiFetch<ProfileUnlocksDto>('/api/dashboard/unlocks', { token }),
    /** Opportunities the user just misses, grouped by what blocked them. */
    nearMisses: (token?: string | null) => apiFetch<NearMissesDto>('/api/dashboard/near-misses', { token }),
  },

  savedSearches: {
    list: (token?: string | null) => apiFetch<SavedSearchDto[]>('/api/saved-searches', { token }),
    create: (body: {
      name?: string;
      query?: string | null;
      filters: Record<string, unknown>;
      frequency?: string;
    }) => apiFetch<SavedSearchDto>('/api/saved-searches', { method: 'POST', body }),
    update: (id: string, body: { name?: string; alertsEnabled?: boolean; frequency?: string }) =>
      apiFetch<SavedSearchDto>(`/api/saved-searches/${id}`, { method: 'PATCH', body }),
    remove: (id: string) => apiFetch<void>(`/api/saved-searches/${id}`, { method: 'DELETE' }),
    results: (id: string, page = 1, token?: string | null) =>
      apiFetch<OpportunitySearchResponse>(`/api/saved-searches/${id}/results?page=${page}`, { token }),
  },

  notifications: {
    list: (unreadOnly = false, token?: string | null) =>
      apiFetch<Paginated<NotificationDto> & { unreadCount: number }>(
        `/api/notifications${unreadOnly ? '?unreadOnly=true' : ''}`,
        { token },
      ),
    markRead: (id: string) => apiFetch<void>(`/api/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => apiFetch<{ marked: number }>('/api/notifications/read-all', { method: 'POST' }),
    preferences: (token?: string | null) =>
      apiFetch<NotificationPreferencesDto>('/api/notifications/preferences', { token }),
    updatePreferences: (body: Partial<NotificationPreferencesDto>) =>
      apiFetch<NotificationPreferencesDto>('/api/notifications/preferences', { method: 'PUT', body }),
  },

  resumes: {
    list: (token?: string | null) => apiFetch<unknown[]>('/api/resumes', { token }),
    extraction: (id: string) => apiFetch<unknown>(`/api/resumes/${id}/extraction`),
    apply: (id: string, body: unknown) =>
      apiFetch<void>(`/api/resumes/${id}/apply`, { method: 'POST', body }),
    remove: (id: string) => apiFetch<void>(`/api/resumes/${id}`, { method: 'DELETE' }),
  },

  assistant: {
    prompts: (token?: string | null) => apiFetch<{ prompts: string[] }>('/api/assistant/prompts', { token }),
    ask: (question: string, conversationId?: string) =>
      apiFetch<AssistantReplyDto>('/api/assistant/ask', { method: 'POST', body: { question, conversationId } }),
    conversations: (token?: string | null) =>
      apiFetch<{ id: string; title: string; updatedAt: string }[]>('/api/assistant/conversations', { token }),
    conversation: (id: string, token?: string | null) =>
      apiFetch<{ id: string; title: string; messages: unknown[] }>(`/api/assistant/conversations/${id}`, { token }),
  },

  taxonomy: {
    get: () => apiFetch<TaxonomyResponse>('/api/taxonomy', { revalidate: 300 }),
  },

  seo: {
    landingPages: () => apiFetch<LandingPage[]>('/api/seo/landing-pages', { revalidate: 3600 }),
    landingPage: (path: string) =>
      apiFetch<LandingPage & { canonicalUrl: string }>(`/api/seo/landing-pages${path}`, { revalidate: 600 }),
    sitemap: (page = 1) =>
      apiFetch<{ page: number; totalPages: number; urls: { loc: string; lastmod?: string }[] }>(
        `/api/seo/sitemap?page=${page}`,
        { revalidate: 900 },
      ),
  },

  admin: {
    analytics: (token?: string | null) => apiFetch<AdminAnalyticsDto>('/api/admin/analytics', { token }),
    dataQuality: (token?: string | null) => apiFetch<DataQualityDto>('/api/admin/data-quality', { token }),
    systemHealth: (token?: string | null) => apiFetch<Record<string, unknown>>('/api/admin/system-health', { token }),
    users: (filters: Record<string, unknown> = {}, token?: string | null) =>
      apiFetch<Paginated<AdminUser>>(`/api/admin/users${toQuery(filters)}`, { token }),
    setUserRole: (id: string, role: 'STUDENT' | 'ADMIN') =>
      apiFetch<void>(`/api/admin/users/${id}/role`, { method: 'POST', body: { role } }),
    opportunities: (filters: Record<string, unknown>, token?: string | null) =>
      apiFetch<OpportunitySearchResponse>(`/api/admin/opportunities${toQuery(filters)}`, { token }),
    createOpportunity: (body: unknown) =>
      apiFetch<OpportunityDetailDto>('/api/admin/opportunities', { method: 'POST', body }),
    updateOpportunity: (id: string, body: unknown) =>
      apiFetch<OpportunityDetailDto>(`/api/admin/opportunities/${id}`, { method: 'PATCH', body }),
    setStatus: (id: string, status: string) =>
      apiFetch<void>(`/api/admin/opportunities/${id}/status`, { method: 'POST', body: { status } }),
    deleteOpportunity: (id: string) =>
      apiFetch<void>(`/api/admin/opportunities/${id}`, { method: 'DELETE' }),
    sources: (token?: string | null) => apiFetch<SourceDto[]>('/api/admin/sources', { token }),
    updateSource: (id: string, body: unknown) =>
      apiFetch<void>(`/api/admin/sources/${id}`, { method: 'PATCH', body }),
    runSource: (id: string, sync = false) =>
      apiFetch<{ queued: boolean }>(`/api/admin/sources/${id}/run${sync ? '?sync=true' : ''}`, { method: 'POST' }),
    ingestionJobs: (filters: Record<string, unknown> = {}, token?: string | null) =>
      apiFetch<Paginated<IngestionJobRow>>(`/api/admin/ingestion/jobs${toQuery(filters)}`, { token }),
    ingestionLogs: (jobId: string, token?: string | null) =>
      apiFetch<IngestionLogRow[]>(`/api/admin/ingestion/jobs/${jobId}/logs`, { token }),
    duplicates: (token?: string | null) => apiFetch<DuplicateGroup[]>('/api/admin/duplicates', { token }),
    mergeDuplicate: (survivorId: string, duplicateId: string) =>
      apiFetch<void>('/api/admin/duplicates/merge', { method: 'POST', body: { survivorId, duplicateId } }),
    flagged: (token?: string | null) => apiFetch<OpportunityDetailDto[]>('/api/admin/flagged', { token }),
    createIndustry: (name: string) =>
      apiFetch<{ id: string; slug: string }>('/api/admin/industries', { method: 'POST', body: { name } }),
    createDomain: (industryId: string, name: string) =>
      apiFetch<{ id: string; slug: string }>('/api/admin/domains', { method: 'POST', body: { industryId, name } }),
    auditLog: (token?: string | null) => apiFetch<AuditRow[]>('/api/admin/audit-log', { token }),
  },
};

/* ------------------------------------------------------------------ *
 * Response shapes the API returns that are not in @odp/shared
 * ------------------------------------------------------------------ */

export interface TaxonomyResponse {
  industries: { name: string; slug: string; opportunityCount: number; domains: { name: string; slug: string }[] }[];
  skills: { name: string; slug: string; category: string | null }[];
  opportunityTypes: { value: string; label: string }[];
  degrees: { value: string; label: string }[];
  workModes: string[];
  experienceBands: { id: string; label: string; minYears: number; maxYears: number | null }[];
  deadlineBuckets: { id: string; label: string; days: number }[];
  companyTypes: string[];
  applicationStatuses: string[];
  governmentCategories: string[];
  psuCategories: string[];
  internshipCategories: string[];
  fresherCategories: string[];
}

export interface LandingPage {
  path: string;
  title: string;
  heading: string;
  description: string;
  filters: Record<string, unknown>;
}

export interface DataQualityDto {
  total: number;
  issues: { key: string; label: string; count: number; percent: number }[];
  review: { flagged: number; unverified: number; duplicates: number };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'ADMIN';
  emailVerified: boolean;
  city: string | null;
  profileCompletion: number;
  applications: number;
  saved: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SourceDto {
  id: string;
  name: string;
  slug: string;
  kind: string;
  trustLevel: string;
  baseUrl: string | null;
  enabled: boolean;
  scheduleCron: string | null;
  rateLimitPerMinute: number;
  respectsRobotsTxt: boolean;
  lastSyncAt: string | null;
  lastStatus: string | null;
  config: Record<string, unknown>;
  stats: { fetched: number; created: number; updated: number; expired: number; failed: number; duplicates: number };
}

export interface IngestionJobRow {
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

export interface IngestionLogRow {
  id: string;
  level: string;
  message: string;
  externalId: string | null;
  createdAt: string;
}

export interface DuplicateGroup {
  dedupeHash: string;
  count: number;
  items: {
    id: string;
    title: string;
    organizationName: string;
    status: string;
    applicationUrl: string;
    createdAt: string;
    sources: string[];
  }[];
}

export interface AuditRow {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}
