/**
 * Role-based access control.
 *
 * Sits after `authenticate`, which is what makes it safe: the role comes from
 * a verified token claim (or the user document), never from the request.
 *
 * Admins are deliberately NOT granted every role implicitly. Where an admin
 * should be able to act on another party's resource, the handler says so
 * explicitly, so a broad admin bypass can never be introduced by accident.
 */

import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/ApiError';
import { requireAuth, type Role } from './auth';

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { role } = requireAuth(req);

    if (!allowed.includes(role)) {
      return next(
        ApiError.forbidden(
          `This endpoint requires the ${allowed.join(' or ')} role.`,
        ),
      );
    }

    next();
  };
}

/** Shorthand for the common admin-only case. */
export const requireAdmin = requireRole('admin');
