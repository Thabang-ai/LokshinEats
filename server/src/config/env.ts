/**
 * Environment loading and validation.
 *
 * The process refuses to boot on invalid configuration rather than failing
 * later on the first request — a bad COMMISSION_RATE, for example, would
 * otherwise silently mis-split real money.
 */

import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from the server package root (one level above src/).
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

/** Comma-separated string -> trimmed, non-empty array. */
const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );

/** Numeric string -> number, validated as a fraction between 0 and 1. */
const fraction = (fallback: number) =>
  z.coerce.number().min(0).max(1).default(fallback);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  CORS_ORIGINS: csv,

  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  COMMISSION_RATE: fraction(0.08),
  DRIVER_DELIVERY_SHARE: fraction(0.85),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_SENSITIVE_MAX: z.coerce.number().int().positive().default(20),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Printed with console.error rather than the logger: the logger itself
  // depends on this module, so it does not exist yet at this point.
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.error(`Invalid API configuration:\n${issues}`);
  throw new Error('Invalid API configuration — refusing to start.');
}

export const env = Object.freeze(parsed.data);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
