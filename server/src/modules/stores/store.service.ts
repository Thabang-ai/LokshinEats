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
  UpdateStoreInput,
} from './store.model';
import * as repository from './store.repository';

const log = moduleLogger('stores');

export async function listStores(query: ListStoresQuery): Promise<Page<Store>> {
  return repository.list(query);
}

export async function getStore(id: string): Promise<Store> {
  const store = await repository.findById(id);
  if (!store) throw ApiError.notFound('No such store.');
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
  return repository.update(store.id, input);
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
