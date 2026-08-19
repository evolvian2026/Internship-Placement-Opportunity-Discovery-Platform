import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const message = {
  error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please slow down.' },
};

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  skip: () => env.isTest,
});

/** Tighter budget for credential endpoints, keyed by IP + email. */
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  skip: () => env.isTest,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${req.ip}:${email}`;
  },
});

export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  skip: () => env.isTest,
});

/** The assistant calls an LLM, so it gets its own budget. */
export const assistantRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  skip: () => env.isTest,
});
