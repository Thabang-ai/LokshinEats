/**
 * User persistence.
 *
 * The repository is the only layer that knows about Firestore. Services above
 * it work in domain terms, which is what will let the storage layer change
 * later without rewriting business rules.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import { buildPage, type Page } from '../../lib/pagination';
import type { Role } from '../../middleware/auth';
import {
  toUserProfile,
  type CreateProfileInput,
  type UpdateProfileInput,
  type UserProfile,
} from './user.model';

const collection = () => db.collection(Collections.users);

export async function findById(uid: string): Promise<UserProfile | null> {
  const snapshot = await collection().doc(uid).get();
  return snapshot.exists ? toUserProfile(snapshot) : null;
}

export async function exists(uid: string): Promise<boolean> {
  const snapshot = await collection().doc(uid).get();
  return snapshot.exists;
}

/**
 * Create the profile document for an already-authenticated Firebase user.
 * The document id is the Firebase uid, which is what makes the security rules
 * `request.auth.uid == userId` comparison work.
 */
export async function create(
  uid: string,
  email: string,
  input: CreateProfileInput,
): Promise<UserProfile> {
  const ref = collection().doc(uid);

  await ref.set({
    email,
    displayName: input.displayName,
    phone: input.phone ?? null,
    address: input.address ?? null,
    role: input.role,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snapshot = await ref.get();
  return toUserProfile(snapshot);
}

export async function update(
  uid: string,
  input: UpdateProfileInput,
): Promise<UserProfile> {
  const ref = collection().doc(uid);

  // Spread only the keys actually present, so an omitted field keeps its
  // current value instead of being overwritten with undefined.
  await ref.update({
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snapshot = await ref.get();
  return toUserProfile(snapshot);
}

export async function setRole(uid: string, role: Role): Promise<UserProfile> {
  const ref = collection().doc(uid);
  await ref.update({ role, updatedAt: FieldValue.serverTimestamp() });
  const snapshot = await ref.get();
  return toUserProfile(snapshot);
}

/** Admin listing, newest first, cursor-paginated. */
export async function list(options: {
  limit: number;
  cursor?: string;
  role?: Role;
}): Promise<Page<UserProfile>> {
  let query = collection().orderBy('createdAt', 'desc');

  if (options.role) {
    query = query.where('role', '==', options.role);
  }

  if (options.cursor) {
    const cursorDoc = await collection().doc(options.cursor).get();
    // An unknown cursor yields the first page rather than an error — a
    // deleted document should not break a client mid-scroll.
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  // One extra row tells us whether a further page exists.
  const snapshot = await query.limit(options.limit + 1).get();
  return buildPage(snapshot.docs.map(toUserProfile), options.limit);
}
