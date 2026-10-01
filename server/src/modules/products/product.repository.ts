/**
 * Product persistence.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import { buildPage, type Page } from '../../lib/pagination';
import {
  toProduct,
  type CreateProductInput,
  type ListProductsQuery,
  type Product,
  type UpdateProductInput,
} from './product.model';

const collection = () => db.collection(Collections.products);

export async function findById(id: string): Promise<Product | null> {
  const snapshot = await collection().doc(id).get();
  return snapshot.exists ? toProduct(snapshot) : null;
}

/**
 * Fetch many products by id in one round trip.
 *
 * Order pricing needs every line item's true price at once; issuing one read
 * per item would make a ten-item order ten sequential round trips.
 * `getAll` accepts at most 300 refs, which is far above any real basket.
 */
export async function findManyByIds(ids: readonly string[]): Promise<Product[]> {
  if (ids.length === 0) return [];

  const refs = ids.map((id) => collection().doc(id));
  const snapshots = await db.getAll(...refs);
  return snapshots.filter((doc) => doc.exists).map(toProduct);
}

export async function create(
  storeId: string,
  input: CreateProductInput,
): Promise<Product> {
  const ref = collection().doc();

  await ref.set({
    ...input,
    // Ownership comes from the caller's store, never from the request body.
    storeId,
    image: input.image ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snapshot = await ref.get();
  return toProduct(snapshot);
}

export async function update(
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  const ref = collection().doc(id);
  await ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  const snapshot = await ref.get();
  return toProduct(snapshot);
}

export async function remove(id: string): Promise<void> {
  await collection().doc(id).delete();
}

export async function list(query: ListProductsQuery): Promise<Page<Product>> {
  // Ordered by name so a menu reads consistently between page loads.
  let firestoreQuery = collection().orderBy('name', 'asc');

  if (query.storeId) {
    firestoreQuery = firestoreQuery.where('storeId', '==', query.storeId);
  }
  if (query.category) {
    firestoreQuery = firestoreQuery.where('category', '==', query.category);
  }
  if (query.availableOnly) {
    firestoreQuery = firestoreQuery.where('available', '==', true);
  }

  if (query.cursor) {
    const cursorDoc = await collection().doc(query.cursor).get();
    if (cursorDoc.exists) {
      firestoreQuery = firestoreQuery.startAfter(cursorDoc);
    }
  }

  const snapshot = await firestoreQuery.limit(query.limit + 1).get();
  return buildPage(snapshot.docs.map(toProduct), query.limit);
}

/** Every product belonging to a store, used when a store is deactivated. */
export async function listByStore(storeId: string): Promise<Product[]> {
  const snapshot = await collection().where('storeId', '==', storeId).get();
  return snapshot.docs.map(toProduct);
}
