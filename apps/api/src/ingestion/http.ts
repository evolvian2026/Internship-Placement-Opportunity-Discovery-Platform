import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Outbound HTTP for connectors.
 *
 * Enforces, per requirement 5:
 *  - a descriptive, contactable User-Agent
 *  - per-host rate limiting
 *  - robots.txt checks before fetching a path
 *  - hard refusal to touch login walls, CAPTCHAs or paywalled endpoints
 *
 * There is deliberately no cookie jar, no headless browser and no CAPTCHA
 * handling: if a source requires those, it is not ingestible here and must be
 * replaced with an official API or feed.
 */

const RATE_STATE = new Map<string, { tokens: number; lastRefill: number; limit: number }>();
const ROBOTS_CACHE = new Map<string, { rules: RobotRule[]; fetchedAt: number }>();
const ROBOTS_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

interface RobotRule {
  allow: boolean;
  path: string;
}

export class AccessNotPermittedError extends Error {
  constructor(url: string, reason: string) {
    super(`Refusing to fetch ${url}: ${reason}`);
    this.name = 'AccessNotPermittedError';
  }
}

function hostOf(url: string): string {
  return new URL(url).host;
}

async function waitForToken(host: string, limitPerMinute: number): Promise<void> {
  const now = Date.now();
  let state = RATE_STATE.get(host);
  if (!state) {
    state = { tokens: limitPerMinute, lastRefill: now, limit: limitPerMinute };
    RATE_STATE.set(host, state);
  }

  // Token bucket refilled continuously at limit/minute.
  const elapsed = now - state.lastRefill;
  const refill = (elapsed / 60_000) * state.limit;
  if (refill > 0) {
    state.tokens = Math.min(state.limit, state.tokens + refill);
    state.lastRefill = now;
  }

  if (state.tokens < 1) {
    const waitMs = Math.ceil(((1 - state.tokens) / state.limit) * 60_000);
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 30_000)));
    state.tokens = 1;
    state.lastRefill = Date.now();
  }
  state.tokens -= 1;
}

function parseRobots(text: string, userAgent: string): RobotRule[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim());
  const groups: { agents: string[]; rules: RobotRule[] }[] = [];
  let current: { agents: string[]; rules: RobotRule[] } | null = null;
  let lastWasAgent = false;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    if (!rest.length) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ allow: key === 'allow', path: value });
      lastWasAgent = false;
    }
  }

  const agentToken = userAgent.split('/')[0].toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a === agentToken));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  return (specific ?? wildcard)?.rules ?? [];
}

function robotsAllows(rules: RobotRule[], pathname: string): boolean {
  // Longest matching rule wins; Allow beats Disallow at equal length.
  let best: RobotRule | null = null;
  for (const rule of rules) {
    if (rule.path === '') continue;
    const pattern = rule.path.replace(/\*/g, '');
    if (!pathname.startsWith(pattern)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

async function checkRobots(url: string): Promise<void> {
  if (!env.INGESTION_RESPECT_ROBOTS) return;

  const target = new URL(url);
  const host = target.host;
  const cached = ROBOTS_CACHE.get(host);
  const fresh = cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS;

  let rules: RobotRule[];
  if (fresh) {
    rules = cached!.rules;
  } else {
    try {
      const res = await fetch(`${target.origin}/robots.txt`, {
        headers: { 'user-agent': env.INGESTION_USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      // A missing robots.txt means no restrictions.
      rules = res.ok ? parseRobots(await res.text(), env.INGESTION_USER_AGENT) : [];
    } catch {
      // If robots.txt is unreachable, assume the conservative default of
      // "allowed", matching standard crawler behaviour.
      rules = [];
    }
    ROBOTS_CACHE.set(host, { rules, fetchedAt: Date.now() });
  }

  if (!robotsAllows(rules, target.pathname)) {
    throw new AccessNotPermittedError(url, 'disallowed by robots.txt');
  }
}

/** Paths that clearly sit behind an access control we must not attempt. */
const FORBIDDEN_PATH_PATTERNS = [
  /\/login\b/i,
  /\/signin\b/i,
  /\/sign-in\b/i,
  /\/auth\b/i,
  /\/account\b/i,
  /\/checkout\b/i,
  /\/subscribe\b/i,
  /captcha/i,
];

function assertFetchable(url: string): void {
  const target = new URL(url);
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new AccessNotPermittedError(url, 'unsupported protocol');
  }
  if (target.username || target.password) {
    throw new AccessNotPermittedError(url, 'URL embeds credentials');
  }
  if (FORBIDDEN_PATH_PATTERNS.some((p) => p.test(target.pathname))) {
    throw new AccessNotPermittedError(url, 'target looks like an authentication or payment wall');
  }
}

export interface FetchOptions extends RequestInit {
  rateLimitPerMinute?: number;
  /** Skip the robots check for endpoints the source documents as an API. */
  isDocumentedApi?: boolean;
}

export async function politeFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { rateLimitPerMinute, isDocumentedApi, ...init } = options;

  assertFetchable(url);
  if (!isDocumentedApi) await checkRobots(url);
  await waitForToken(hostOf(url), rateLimitPerMinute ?? env.INGESTION_DEFAULT_RATE_LIMIT);

  const res = await fetch(url, {
    ...init,
    headers: {
      'user-agent': env.INGESTION_USER_AGENT,
      accept: 'application/json, application/xml, text/xml, text/html;q=0.9',
      ...(init.headers ?? {}),
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 401 || res.status === 403) {
    throw new AccessNotPermittedError(url, `source returned ${res.status} — access is not public`);
  }
  if (res.status === 429) {
    logger.warn({ url }, 'source rate-limited the crawler');
    throw new Error(`Rate limited by ${hostOf(url)}`);
  }
  if (!res.ok) {
    throw new Error(`Fetch failed with ${res.status} for ${url}`);
  }
  return res;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const res = await politeFetch(url, options);
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const res = await politeFetch(url, { ...options, isDocumentedApi: options.isDocumentedApi ?? true });
  return (await res.json()) as T;
}

/** Exposed for tests. */
export const __testing = { parseRobots, robotsAllows };
