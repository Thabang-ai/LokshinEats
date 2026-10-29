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

/**
 * Whether push is on when nothing says otherwise.
 *
 * On in production, where the service-account credentials FCM needs always
 * exist, and off everywhere else: the emulators have no messaging service,
 * and a test run must never buzz a real phone.
 */
export function defaultPushProvider(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): 'off' | 'fcm' {
  return nodeEnv === 'production' ? 'fcm' : 'off';
}

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

  /**
   * Share of a driver's delivery pay they receive as a base arrival fee when
   * an order they had been dispatched to is cancelled while the food is still
   * in the kitchen. See orders/cancellation.policy.ts.
   */
  DRIVER_ARRIVAL_FEE_SHARE: fraction(0.5),

  /**
   * Which payment provider handles charges. "sandbox" moves no real money
   * and refuses to run in production unless ALLOW_SANDBOX_PAYMENTS is set.
   * "none" runs cash only: no card or EFT provider is registered, orders for
   * anything but cash are refused, and /api/v1/config tells the apps so.
   */
  PAYMENT_PROVIDER: z.string().trim().min(1).default('sandbox'),
  ALLOW_SANDBOX_PAYMENTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Where a redirect-style provider returns the customer afterwards. */
  PAYMENT_RETURN_URL: z.string().trim().url().optional(),

  /**
   * How notifications reach phones. "off" still stores every notification
   * for the in-app inbox and sends nothing; "fcm" also pushes through Firebase
   * Cloud Messaging, which needs the deployment's service-account credentials.
   *
   * On by default in production, where those credentials always exist, and off
   * everywhere else: the emulators have no messaging service, and a test run
   * must never buzz a real phone. Set `PUSH_PROVIDER=off` in production to
   * silence it without a code change.
   */
  PUSH_PROVIDER: z.enum(['off', 'fcm']).default(defaultPushProvider()),

  /**
   * How long a driver has to hand a kitchen its cash after delivering.
   *
   * The platform never touches this money: the customer pays the driver, and
   * the driver pays the kitchen. Until there was a deadline, "later" was a
   * perfectly good answer and the kitchen's only recourse was to ask.
   */
  CASH_HANDOVER_HOURS: z.coerce.number().positive().max(720).default(24),

  /**
   * Shared secret for the scheduled cash sweep, which has no admin to sign
   * in as. Unset means the sweep can only be run by an admin by hand.
   */
  CRON_SECRET: z.string().trim().min(16).optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_SENSITIVE_MAX: z.coerce.number().int().positive().default(20),
});

/**
 * Settings that would not stop a production API booting, but would make it
 * fail on every real request instead - quietly, from the server's side.
 *
 *  - An empty CORS_ORIGINS rejects every browser origin in production, so the
 *    web app's requests all fail as CORS errors that never reach the logs.
 *  - Without credentials, Firebase Admin only fails on its first call, so a
 *    deploy looks healthy until the first customer tries to order.
 *
 * Exported for tests, which cannot re-import this module per case.
 */
export function productionProblems(config: {
  NODE_ENV: string;
  CORS_ORIGINS: string[];
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  usingEmulator: boolean;
}): string[] {
  if (config.NODE_ENV !== 'production') return [];

  const problems: string[] = [];

  if (config.CORS_ORIGINS.length === 0) {
    problems.push(
      'CORS_ORIGINS is empty. List the web app\'s origin (for example ' +
        'https://lokshineats.vercel.app), or every browser request is refused.',
    );
  }

  if (
    !config.usingEmulator &&
    !config.FIREBASE_SERVICE_ACCOUNT_JSON &&
    !config.GOOGLE_APPLICATION_CREDENTIALS
  ) {
    problems.push(
      'No Firebase credentials. On Vercel, set FIREBASE_SERVICE_ACCOUNT_JSON ' +
        'to the whole service-account key.',
    );
  }

  return problems;
}

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

const problems = productionProblems({
  ...parsed.data,
  usingEmulator: Boolean(process.env.FIRESTORE_EMULATOR_HOST),
});
if (problems.length > 0) {
  console.error(
    `Invalid production configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
  );
  throw new Error('Invalid production configuration — refusing to start.');
}

export const env = Object.freeze(parsed.data);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
