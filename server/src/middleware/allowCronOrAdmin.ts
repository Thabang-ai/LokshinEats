/**
 * A route a schedule can call, and an admin can press.
 *
 * The cash sweep has to run whether or not anybody is looking - that is the
 * whole point of a deadline - and a scheduler has no account to sign in as.
 * So it may present a shared secret instead, compared in constant time, and
 * everything else goes through the ordinary admin path.
 *
 * With no secret set the schedule simply cannot call it, which is the right
 * default: the sweep still works, an admin just has to press it.
 */

import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { authenticate } from './auth';
import { requireAdmin } from './requireRole';

/** Equal-length compare that does not leak the answer in how long it takes. */
function matches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function allowCronOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const presented =
    req.header('x-cron-key') ??
    // Vercel Cron sends the project's own secret this way.
    req.header('authorization')?.replace(/^Bearer /i, '');

  if (env.CRON_SECRET && presented && matches(presented, env.CRON_SECRET)) {
    return next();
  }

  // Not the schedule: an admin, then, by the usual route.
  return authenticate(req, res, (error?: unknown) => {
    if (error) return next(error);
    return requireAdmin(req, res, next);
  });
}
