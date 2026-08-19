import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  transport: env.isProduction
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } },
  base: { service: 'odp-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.passwordHash',
      'extractedText',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
