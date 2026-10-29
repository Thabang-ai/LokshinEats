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
import * as storeRepository from '../stores/store.repository';

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

  const current = await repository.findById(targetUid);
  if (!current) {
    throw ApiError.notFound('No such user.');
  }

  // No shortcut for "already that role". If revoking failed last time, the
  // role is already set and a retry must still revoke - skipping it here
  // would leave the old role live while telling the admin it worked. Setting
  // the same role again therefore signs the user out, which for an explicit
  // action on their account is the right side of that trade.
  await syncRoleClaim(targetUid, role);
  const profile = await repository.setRole(targetUid, role);

  // The new claim only reaches a token when one is next minted, and the auth
  // middleware trusts the claim in the token it is shown. Without this, a
  // demoted admin or vendor keeps every power they had until their current
  // ID token expires - up to an hour. Revoking makes that token stop working
  // at once (the middleware checks revocation), so a removed role is removed
  // now. They sign in again and get a token carrying the role they have.
  //
  // Only here, deliberately: profile creation and kitchen registration also
  // set the claim, and revoking there would sign a brand-new account out in
  // the middle of setting itself up.
  await revokeSessions(targetUid);

  log.warn(
    { actor: actor.uid, target: targetUid, from: current.role, to: role },
    'Role changed by admin; sessions revoked.',
  );
  return profile;
}

/**
 * Give an account a role it has earned, without touching one it already has.
 *
 * Separate from `assignRole`, which is an admin acting on somebody else and
 * therefore revokes their sessions. This is the platform acting on a decision
 * the account asked for - being approved to deliver - so nothing is revoked:
 * a driver halfway through a delivery should not be signed out by their own
 * approval. Their token simply does not carry the new role until it is next
 * minted, which is what `tokenRefreshRequired` tells the client.
 *
 * Only a customer is promoted. A vendor who is approved to drive keeps their
 * kitchen: roles here are one per account, so promoting them would quietly
 * lock them out of it. An admin already passes every check a driver does.
 *
 * Returns whether anything was changed.
 */
export async function grantEarnedRole(
  uid: string,
  role: Role,
): Promise<boolean> {
  const current = await repository.findById(uid);
  if (!current || current.role !== 'customer') return false;

  await syncRoleClaim(uid, role);
  await repository.setRole(uid, role);

  log.info({ uid, from: current.role, to: role }, 'Role granted.');
  return true;
}

async function revokeSessions(uid: string): Promise<void> {
  try {
    await adminAuth.revokeRefreshTokens(uid);
  } catch (error) {
    // The role is already changed, so this is the one failure worth shouting
    // about: the old role is still live in their token. Retrying is safe and
    // does revoke, because assignRole never skips this step.
    log.error({ uid, err: error }, 'Role changed but sessions not revoked.');
    throw ApiError.internal(
      'The role was changed but their current session is still active. Try again.',
    );
  }
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

/**
 * The kitchens this customer has favourited.
 *
 * Ids only: a favourite is a bookmark, and the store it points at is fetched
 * through the stores endpoints like any other. That also means a kitchen that
 * closes or is removed simply stops appearing, rather than leaving a broken
 * copy of itself on someone's list.
 */
export async function listFavourites(uid: string): Promise<string[]> {
  return repository.listFavourites(uid);
}

/**
 * Favourite a kitchen.
 *
 * The store has to exist. Without that check a typo, or a stale id from an
 * app that has been open for a week, becomes a permanent entry on someone's
 * list pointing at nothing.
 */
export async function addFavourite(
  uid: string,
  storeId: string,
): Promise<string[]> {
  const store = await storeRepository.findById(storeId);
  if (!store) throw ApiError.notFound('No such kitchen.');

  return repository.addFavourite(uid, storeId);
}

/**
 * Un-favourite a kitchen.
 *
 * No existence check: a store that has since been removed is exactly the kind
 * of thing someone needs to be able to take off their list.
 */
export async function removeFavourite(
  uid: string,
  storeId: string,
): Promise<string[]> {
  return repository.removeFavourite(uid, storeId);
}
