/**
 * User business rules.
 *
 * Two invariants live here:
 *   - A profile's id is always the caller's Firebase uid.
 *   - The role stored on the document and the role in the Firebase custom
 *     claim never diverge, because authentication trusts the claim.
 */

import { auth as adminAuth } from '../../config/firebase';
import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import type { Page } from '../../lib/pagination';
import type { AuthContext, Role } from '../../middleware/auth';
import type {
  CreateProfileInput,
  UpdateProfileInput,
  UserProfile,
} from './user.model';
import * as repository from './user.repository';

const log = moduleLogger('users');

export async function getProfile(uid: string): Promise<UserProfile> {
  const profile = await repository.findById(uid);
  if (!profile) {
    throw ApiError.notFound('No profile exists for this account yet.');
  }
  return profile;
}

/**
 * Create the caller's own profile after Firebase Auth sign-up.
 *
 * Idempotent by conflict rather than by overwrite: a repeated call must not
 * silently reset a role or wipe an address.
 */
export async function createOwnProfile(
  caller: AuthContext,
  input: CreateProfileInput,
): Promise<UserProfile> {
  if (await repository.exists(caller.uid)) {
    throw ApiError.conflict('A profile already exists for this account.');
  }

  if (!caller.email) {
    throw ApiError.unprocessable(
      'This account has no email address. Sign up with email before creating a profile.',
    );
  }

  const profile = await repository.create(caller.uid, caller.email, input);
  await syncRoleClaim(caller.uid, profile.role);

  log.info({ uid: caller.uid, role: profile.role }, 'Profile created.');
  return profile;
}

export async function updateOwnProfile(
  caller: AuthContext,
  input: UpdateProfileInput,
): Promise<UserProfile> {
  if (!(await repository.exists(caller.uid))) {
    throw ApiError.notFound('No profile exists for this account yet.');
  }

  // The web app reads the name from the Firebase Auth record, the Flutter app
  // from this profile. Updating only one would leave the two apps greeting
  // the same customer by different names.
  if (input.displayName !== undefined) {
    await syncDisplayName(caller.uid, input.displayName);
  }

  return repository.update(caller.uid, input);
}

/**
 * Admin role assignment.
 *
 * The claim is written before the document. If the second write fails the
 * account is left with a claim that outranks its document, which the auth
 * middleware resolves in favour of the claim — deliberate, because the
 * alternative ordering could leave an intended admin locked out with no way
 * to retry.
 */
export async function assignRole(
  actor: AuthContext,
  targetUid: string,
  role: Role,
): Promise<UserProfile> {
  if (actor.uid === targetUid && role !== 'admin') {
    // Removing your own admin rights can leave the platform with no admin at
    // all, and it is almost always a mis-click.
    throw ApiError.conflict(
      'You cannot remove your own admin role. Ask another admin to do it.',
    );
  }

  if (!(await repository.exists(targetUid))) {
    throw ApiError.notFound('No such user.');
  }

  await syncRoleClaim(targetUid, role);
  const profile = await repository.setRole(targetUid, role);

  log.warn(
    { actor: actor.uid, target: targetUid, role },
    'Role changed by admin.',
  );
  return profile;
}

export async function listUsers(options: {
  limit: number;
  cursor?: string;
  role?: Role;
}): Promise<Page<UserProfile>> {
  return repository.list(options);
}

export async function getUserAsAdmin(uid: string): Promise<UserProfile> {
  const profile = await repository.findById(uid);
  if (!profile) throw ApiError.notFound('No such user.');
  return profile;
}

/**
 * Mirror a changed name onto the Firebase Auth record.
 *
 * Written before the profile document, the same ordering as the role claim:
 * if the document write then fails, retrying the request repairs both.
 */
async function syncDisplayName(uid: string, displayName: string): Promise<void> {
  try {
    await adminAuth.updateUser(uid, { displayName });
  } catch (error) {
    log.error({ uid, err: error }, 'Failed to update the Auth display name.');
    throw ApiError.internal('Could not save your name. Try again.');
  }
}

/**
 * Mirror the role into a Firebase custom claim.
 *
 * Claims are read straight from the verified token, so this is what keeps
 * authorisation cheap. A client must refresh its ID token before a new role
 * takes effect, which is why the response tells it to.
 */
async function syncRoleClaim(uid: string, role: Role): Promise<void> {
  try {
    await adminAuth.setCustomUserClaims(uid, { role });
  } catch (error) {
    log.error({ uid, role, err: error }, 'Failed to set role claim.');
    throw ApiError.internal('Could not apply the role change. Try again.');
  }
}
