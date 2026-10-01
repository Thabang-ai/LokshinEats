/**
 * Store persistence.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import { buildPage, type Page } from '../../lib/pagination';
import {
  toStore,
  type CreateStoreInput,
  type ListStoresQuery,
  type Store,
  type UpdateStoreInput,
} from './store.model';

const collection = () => db.collection(Collections.stores);

export async function findById(id: string): Promise<Store | null> {
  const snapshot = await collection().doc(id).get();
  return snapshot.exists ? toStore(snapshot) : null;
}

/** A vendor owns at most one store, so this doubles as the ownership lookup. */
export async function findByOwner(ownerId: string): Promise<Store | null> {
  const snapshot = await collection()
    .where('ownerId', '==', ownerId)
    .limit(1)
    .get();

  const doc = snapshot.docs[0];
  return doc ? toStore(doc) : null;
}

export async function create(
  ownerId: string,
  input: CreateStoreInput,
): Promise<Store> {
  const ref = collection().doc();

  await ref.set({
    ...input,
    ownerId,
    // Card thumbnails prefer the wide banner, falling back to the logo, so a
    // store that uploaded only one image still shows a photo.
    image: input.banner ?? input.logo ?? null,
    logo: input.logo ?? null,
    banner: input.banner ?? null,
    // Derived fields are seeded by the server and never accepted from input.
    rating: 0,
    reviewCount: 0,
    // A new store stays closed until the vendor opens it from the dashboard.
    isOpen: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snapshot = await ref.get();
  return toStore(snapshot);
}

export async function update(
  id: string,
  input: UpdateStoreInput,
): Promise<Store> {
  const ref = collection().doc(id);

  const patch: Record<string, unknown> = {
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Keep the derived thumbnail in step when either image changes.
  if (input.banner !== undefined || input.logo !== undefined) {
    const current = await ref.get();
    const banner = input.banner ?? current.get('banner') ?? null;
    const logo = input.logo ?? current.get('logo') ?? null;
    patch.image = banner ?? logo ?? null;
  }

  await ref.update(patch);
  const snapshot = await ref.get();
  return toStore(snapshot);
}

/**
 * Public store listing.
 *
 * Ordered by name rather than creation date: browsing customers expect a
 * stable alphabetical list, and it keeps the cursor meaningful when new
 * stores are added mid-scroll.
 */
export async function list(query: ListStoresQuery): Promise<Page<Store>> {
  let firestoreQuery = collection().orderBy('name', 'asc');

  if (query.city) {
    firestoreQuery = firestoreQuery.where('city', '==', query.city);
  }
  if (query.cuisine) {
    firestoreQuery = firestoreQuery.where('cuisine', '==', query.cuisine);
  }
  if (query.openOnly) {
    firestoreQuery = firestoreQuery.where('isOpen', '==', true);
  }

  if (query.cursor) {
    const cursorDoc = await collection().doc(query.cursor).get();
    if (cursorDoc.exists) {
      firestoreQuery = firestoreQuery.startAfter(cursorDoc);
    }
  }

  const snapshot = await firestoreQuery.limit(query.limit + 1).get();
  return buildPage(snapshot.docs.map(toStore), query.limit);
}
