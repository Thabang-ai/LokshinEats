/**
 * Role-based access control.
 *
 * Sits after `authenticate`, which is what makes it safe: the role comes from
 * a verified token claim (or the user document), never from the request.
 *
 * Admins are deliberately NOT granted every role implicitly. Where an admin
 * should be able to act on another party's resource, the handler says so
 * explicitly, so a broad admin bypass can never be introduced by accident.
 *
 * A role in a token is a snapshot of who somebody was when they last signed
 * in, and it is good for an hour. A role granted since then - an approved
 * driver being made a driver - is not in it, so the refusal here would stand
 * for the rest of that hour however many times they tried, and no amount of
 * fixing it server-side would show. Rather than refuse on a stale snapshot,
 * this reads the account itself before saying no.
 *
 * Safe because nothing else trusts the token more than the account either: a
 * demoted role revokes their sessions, and a suspended account is disabled in
 * Firebase Auth, so both are refused by `authenticate` before this runs. The
 * document is where a role actually lives; the claim is a copy kept for speed.
 */

import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/ApiError';
import { moduleLogger } from '../config/logger';
import { readRoleFromDocument, requireAuth, type Role } from './auth';

const log = moduleLogger('auth');

export function requireRole(...allowed: Role[]) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const caller = requireAuth(req);

    if (allowed.includes(caller.role)) return next();

    try {
      // Only on the way to a refusal, so the ordinary request still costs
      // nothing beyond the token it already carries.
      const stored = await readRoleFromDocument(caller.uid);

      if (stored && allowed.includes(stored)) {
        req.auth = { ...caller, role: stored, roleFromClaim: false };
        log.info(
          { uid: caller.uid, claimed: caller.role, stored },
          'Token carried a role the account has since outgrown.',
        );
        return next();
      }
    } catch (error) {
      // A read that fails is not a reason to let somebody in. Refuse as
      // before, and say so, because this is the quiet path.
      log.warn({ uid: caller.uid, err: error }, 'Could not re-check the role.');
    }

    return next(
      ApiError.forbidden(
        `This endpoint requires the ${allowed.join(' or ')} role.`,
      ),
    );
  };
}

/** Shorthand for the common admin-only case. */
export const requireAdmin = requireRole('admin');
