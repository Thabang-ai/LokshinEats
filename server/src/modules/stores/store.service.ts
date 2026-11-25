/**
 * Store business rules.
 *
 * Ownership is the whole story here: every mutation resolves the caller's own
 * store rather than trusting a store id from the request, so a vendor cannot
 * edit a competitor's menu by guessing an id.
 */

import { auth as adminAuth } from '../../config/firebase';
import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import type { Page } from '../../lib/pagination';
import type { AuthContext } from '../../middleware/auth';
import * as userRepository from '../users/user.repository';
import type {
  CreateStoreInput,
  ListStoresQuery,
  Store,
  StoreVerificationStatus,
  UpdateStoreInput,
} from './store.model';
import * as repository from './store.repository';
import {
  assertUploadable,
  storeImageKey,
  storeImagePath,
  type ImageContentType,
  type StoreImageKind,
} from '../images/image.model';
import { imageStore, type StoredImage } from '../images/image.store';

const log = moduleLogger('stores');

/**
 * The kitchens a customer may browse.
 *
 * Filtered here rather than in the query because a kitchen that predates the
 * review queue carries no `verification` field at all, and Firestore cannot
 * match a field that is not there - a `where` clause would hide every
 * kitchen trading today. The cost is that a page can come back short of its
 * limit while any unapproved kitchens exist; with a few hundred kitchens
 * that is nothing, and once the field is backfilled onto every document the
 * filter belongs in the query.
 */
export async function listStores(query: ListStoresQuery): Promise<Page<Store>> {
  const page = await repository.list(query);

  return {
    ...page,
    items: page.items.filter(
      (store) =>
        store.verification === 'approved' &&
        // Firestore filtered on the switch; the clock is applied here, so a
        // kitchen on scheduled hours drops out of "open now" when it closes
        // rather than being listed and then refusing the order.
        (!query.openOnly || store.isOpen),
    ),
  };
}

export async function getStore(id: string): Promise<Store> {
  const store = await repository.findById(id);
  if (!store) throw ApiError.notFound('No such store.');

  // Not "this kitchen is pending": whether an unapproved kitchen exists is
  // not a customer's business, and the vendor reads their own status through
  // /stores/mine.
  if (store.verification !== 'approved') {
    throw ApiError.notFound('No such store.');
  }

  return store;
}

/**
 * Register a store for the calling account and promote it to the vendor role.
 *
 * The promotion happens here rather than at sign-up because it is the store
 * that makes someone a vendor. The web app currently lets the browser write
 * `role: 'vendor'` onto its own user document; routing it through this
 * endpoint is what will let that path be closed off in the security rules.
 */
export async function createStore(
  caller: AuthContext,
  input: CreateStoreInput,
): Promise<Store> {
  const existing = await repository.findByOwner(caller.uid);
  if (existing) {
    throw ApiError.conflict(
      'This account already has a store. Update it instead of creating another.',
    );
  }

  const store = await repository.create(caller.uid, input);

  // Best-effort promotion: the store exists either way, and an admin can fix
  // a stuck role. Failing the whole request would leave an orphaned store.
  try {
    await userRepository.setRole(caller.uid, 'vendor');
    await adminAuth.setCustomUserClaims(caller.uid, { role: 'vendor' });
  } catch (error) {
    log.error(
      { uid: caller.uid, storeId: store.id, err: error },
      'Store created but vendor promotion failed.',
    );
  }

  log.info({ uid: caller.uid, storeId: store.id }, 'Store registered.');
  return store;
}

/** The calling vendor's own store. */
export async function getOwnStore(caller: AuthContext): Promise<Store> {
  const store = await repository.findByOwner(caller.uid);
  if (!store) {
    throw ApiError.notFound('You have not registered a store yet.');
  }
  return store;
}

export async function updateOwnStore(
  caller: AuthContext,
  input: UpdateStoreInput,
): Promise<Store> {
  const store = await getOwnStore(caller);

  // A kitchen nobody has approved cannot put itself on the platform. It may
  // still write its menu and fix its address while it waits - the one thing
  // it may not do is open.
  if (input.isOpen === true && store.verification !== 'approved') {
    throw ApiError.conflict(
      store.verification === 'rejected'
        ? store.verificationReason ??
            'This kitchen was turned down. Update your details and ask us to look again.'
        : 'LokshinEats is still checking this kitchen. You can open it once that is done.',
    );
  }

  return repository.update(store.id, input);
}

/**
 * Every kitchen awaiting a decision, or already decided.
 *
 * Unpaginated like the driver queue, and for the same reason: a platform
 * with more kitchens than a person can review has outgrown a human queue
 * first.
 */
export async function listForReview(
  status?: StoreVerificationStatus,
): Promise<Store[]> {
  return repository.listForReview(status);
}

/**
 * An admin approves or turns down a kitchen.
 *
 * Turning one down closes it in the same write, so a kitchen that was open
 * when the decision came stops taking orders immediately.
 */
export async function decide(
  actor: AuthContext,
  storeId: string,
  input: { decision: 'approve' | 'reject'; reason?: string },
): Promise<Store> {
  const existing = await repository.findById(storeId);
  if (!existing) throw ApiError.notFound('No such store.');

  const verification: StoreVerificationStatus =
    input.decision === 'approve' ? 'approved' : 'rejected';

  const store = await repository.decide(storeId, {
    verification,
    reason: input.reason ?? null,
    decidedBy: actor.uid,
  });

  log.warn(
    { storeId, decision: verification, by: actor.uid },
    'Kitchen decided.',
  );

  return store;
}

/**
 * Put a photograph on the caller's own kitchen.
 *
 * The banner is the wide picture across the top of a kitchen's page; the
 * logo is the small round one. Both were impossible to set from either app:
 * the website uploaded them to a Firebase Storage bucket that does not
 * exist, and failed before the kitchen was written - so a vendor who chose a
 * logo while registering lost the registration.
 */
export async function setOwnStoreImage(
  caller: AuthContext,
  kind: StoreImageKind,
  bytes: Buffer,
  contentType: ImageContentType,
): Promise<Store> {
  const store = await getOwnStore(caller);

  const version = await imageStore().put(storeImageKey(store.id, kind), {
    bytes: assertUploadable(bytes),
    contentType,
  });

  log.info(
    { uid: caller.uid, storeId: store.id, kind, bytes: bytes.length },
    'Store photo uploaded.',
  );

  return repository.update(store.id, {
    [kind]: storeImagePath(store.id, kind, version),
  });
}

/** A kitchen's photograph, for anyone: storefronts are public. */
export async function getStoreImage(
  storeId: string,
  kind: StoreImageKind,
): Promise<StoredImage> {
  const stored = await imageStore().get(storeImageKey(storeId, kind));
  if (!stored) throw ApiError.notFound('No photo of that kind.');
  return stored;
}

/**
 * Admin edit of any store.
 *
 * Separate from the vendor path so the ownership check is never accidentally
 * bypassed by adding 'admin' to a role list on the vendor route.
 */
export async function updateStoreAsAdmin(
  actor: AuthContext,
  storeId: string,
  input: UpdateStoreInput,
): Promise<Store> {
  await getStore(storeId);
  log.warn({ actor: actor.uid, storeId }, 'Store edited by admin.');
  return repository.update(storeId, input);
}

/**
 * Resolve the store a vendor owns, for other modules that need it.
 * Throws rather than returning null: every caller treats a missing store as
 * a failed request.
 */
export async function requireOwnedStore(caller: AuthContext): Promise<Store> {
  return getOwnStore(caller);
}
