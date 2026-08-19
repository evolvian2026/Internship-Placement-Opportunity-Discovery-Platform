import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema, type ZodTypeAny } from 'zod';
import { BadRequestError } from '../lib/errors';

type Source = 'body' | 'query' | 'params';

function formatZodError(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Validates and *replaces* the request segment with the parsed value, so
 * handlers receive typed, coerced and stripped input.
 */
export function validate<S extends ZodTypeAny>(schema: S, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new BadRequestError('Validation failed', formatZodError(result.error)));
    }
    // `req.query` is a getter in Express 5-style setups; assign defensively.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

/** Parses a value outside the middleware chain (e.g. inside a service). */
export function parseOrThrow<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestError('Validation failed', formatZodError(result.error));
  return result.data;
}
