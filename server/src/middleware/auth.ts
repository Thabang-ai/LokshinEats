/**
 * Authentication.
 *
 * Clients present a Firebase ID token (itself a signed JWT) as
 * `Authorization: Bearer <token>`. Verifying it with the Admin SDK checks the
 * signature, issuer, audience, and expiry against Google's rotating public
 * keys, so a forged or stale token cannot pass.
 *
 * Keeping Firebase Auth rather than minting our own JWTs means the existing
 * web app's sessions and the new Flutter apps authenticate identically, with
 * no user migration.
 *
 * Role resolution prefers a custom claim, because that travels inside the
 * verified token and costs no read. Accounts created before roles were
 * mirrored into claims fall back to their `users/{uid}` document, and the
 * claim is backfilled so the next request takes the fast path.
 */

import type { NextFunction, Request, Response } from 'express';
import { auth as adminAuth, Collections, db } from '../config/firebase';
import { ApiError } from '../lib/ApiError';
import { moduleLogger } from '../config/logger';

const log = moduleLogger('auth');

export const ROLES = ['customer', 'driver', 'vendor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export type AuthContext = {
  uid: string;
  email: string | null;
  role: Role;
  /** True when the role came from a verified custom claim. */
  roleFromClaim: boolean;
};

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Pull a bearer token out of the Authorization header. */
function readBearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * Look up a role in Firestore for accounts that predate custom claims, and
 * backfill the claim so this only ever happens once per account.
 */
async function resolveRoleFromDocument(uid: string): Promise<Role> {
  const snapshot = await db.collection(Collections.users).doc(uid).get();

  if (!snapshot.exists) {
    // Authenticated with Firebase but has no profile yet. Treated as a
    // customer, which is the least-privileged role.
    return 'customer';
  }

  const role = snapshot.get('role');
  const resolved: Role = isRole(role) ? role : 'customer';

  try {
    await adminAuth.setCustomUserClaims(uid, { role: resolved });
    log.info({ uid, role: resolved }, 'Backfilled role custom claim.');
  } catch (error) {
    // Non-fatal: the request can still proceed on the document-sourced role.
    log.warn({ uid, err: error }, 'Could not backfill role claim.');
  }

  return resolved;
}

/** Reject the request unless it carries a valid Firebase ID token. */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readBearerToken(req);
    if (!token) {
      throw ApiError.unauthenticated(
        'Provide a Firebase ID token as "Authorization: Bearer <token>".',
      );
    }

    // checkRevoked: a signed-out or disabled account stops working immediately
    // instead of staying valid until the token's natural expiry.
    const decoded = await adminAuth.verifyIdToken(token, true);

    const claimRole = decoded.role;
    const role = isRole(claimRole)
      ? claimRole
      : await resolveRoleFromDocument(decoded.uid);

    req.auth = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      role,
      roleFromClaim: isRole(claimRole),
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);

    // Firebase surfaces expiry, revocation, and malformed tokens as codes.
    const code = (error as { code?: string }).code ?? '';
    if (code === 'auth/id-token-expired') {
      return next(ApiError.unauthenticated('Session expired — sign in again.'));
    }
    if (code === 'auth/id-token-revoked' || code === 'auth/user-disabled') {
      return next(ApiError.unauthenticated('Session is no longer valid.'));
    }

    log.debug({ err: error }, 'Token verification failed.');
    return next(ApiError.unauthenticated('Invalid authentication token.'));
  }
}

/**
 * Populate `req.auth` when a token is present, but allow anonymous access.
 * Used by endpoints that are public yet richer when signed in, such as store
 * listings that mark the caller's favourites.
 */
export async function authenticateOptional(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!readBearerToken(req)) return next();
  return authenticate(req, res, next);
}

/** Narrow `req.auth` to non-undefined, or fail loudly at the call site. */
export function requireAuth(req: Request): AuthContext {
  if (!req.auth) {
    // Programmer error: a handler asked for identity without the middleware.
    throw ApiError.internal('Route is missing the authenticate middleware.');
  }
  return req.auth;
}
