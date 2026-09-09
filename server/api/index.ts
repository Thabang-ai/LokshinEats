/**
 * Vercel serverless entrypoint.
 *
 * Vercel runs each request through a function rather than a long-lived
 * process, so nothing here may call `listen()` — that is what `src/index.ts`
 * does, and it is deliberately kept separate. An Express app is itself a
 * `(req, res)` handler, so exporting it is all that is needed.
 *
 * `vercel.json` rewrites every path here, not just /api/*, so the app's own
 * router owns the URL space — /health and /api/v1/* both land on it.
 *
 * The app is built at module scope so a warm invocation reuses it, along with
 * the Firebase Admin connection underneath. A cold start pays for both once.
 *
 * Two things behave differently here than on a normal server, and both are
 * documented in the README's deployment section rather than silently accepted:
 *
 *   - Rate limiting is in-memory, so each function instance keeps its own
 *     counters. The limits still blunt a single attacker hammering one warm
 *     instance, but they are not a global budget. Moving them to a shared
 *     store is the fix when that matters.
 *   - Application Default Credentials do not exist off Google infrastructure,
 *     so FIREBASE_SERVICE_ACCOUNT_JSON must be set in the project's
 *     environment variables.
 */

import { createApp } from '../src/app';

export default createApp();
