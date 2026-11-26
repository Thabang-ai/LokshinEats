/**
 * Driver verification records.
 *
 * One document per driver, keyed by their uid. No client writes to this
 * collection: it holds licence and identity numbers, and the rules deny it
 * outright, so everything here goes through the Admin SDK.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import {
  toDriverProfile,
  type DriverProfile,
  type SubmitDriverDetailsInput,
  type VerificationStatus,
} from './driver.model';

const collection = () => db.collection(Collections.drivers);

export async function findById(uid: string): Promise<DriverProfile | null> {
  const snapshot = await collection().doc(uid).get();
  return snapshot.exists ? toDriverProfile(snapshot) : null;
}

/**
 * Record what a driver says about themselves, and put them back in the queue.
 *
 * Submitting again always returns to `pending`, including after approval: a
 * driver who was approved on a bicycle and now says they are on a motorbike
 * has not been approved for the motorbike.
 */
export async function submitDetails(
  uid: string,
  input: SubmitDriverDetailsInput,
): Promise<DriverProfile> {
  const ref = collection().doc(uid);
  const existing = await ref.get();

  await ref.set(
    {
      vehicleType: input.vehicleType,
      licenceNumber: input.licenceNumber ?? null,
      vehicleRegistration: input.vehicleRegistration ?? null,
      idNumber: input.idNumber,
      status: 'pending',
      decisionReason: null,
      decidedAt: null,
      decidedBy: null,
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return toDriverProfile(await ref.get());
}

/** Go on or off the road. */
export async function setAvailability(
  uid: string,
  online: boolean,
): Promise<DriverProfile> {
  const ref = collection().doc(uid);

  await ref.update({
    isOnline: online,
    onlineChangedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return toDriverProfile(await ref.get());
}

/**
 * Approved drivers who are on the road right now.
 *
 * Read in memory rather than with a `where`, for the reason that keeps
 * coming up: every driver approved before the switch existed carries no
 * `isOnline` field at all, and Firestore cannot match a field that is not
 * there - a query would quietly stop telling any of them about work.
 */
export async function listOnline(limit = 200): Promise<DriverProfile[]> {
  const snapshot = await collection()
    .where('status', '==', 'approved')
    .limit(limit)
    .get();

  return snapshot.docs.map(toDriverProfile).filter((driver) => driver.isOnline);
}

export async function decide(
  uid: string,
  input: {
    status: VerificationStatus;
    reason: string | null;
    decidedBy: string;
  },
): Promise<DriverProfile> {
  const ref = collection().doc(uid);

  await ref.update({
    status: input.status,
    decisionReason: input.reason,
    decidedBy: input.decidedBy,
    decidedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return toDriverProfile(await ref.get());
}

/**
 * Every driver record, newest first, optionally only those in one state.
 *
 * Unpaginated on purpose: this is the admin's review queue, and a platform
 * with enough drivers for this to matter will have outgrown a human queue
 * first.
 *
 * Firestore does no ordering here, and that is deliberate twice over. An
 * equality filter combined with an ordering on another field needs a composite
 * index: there was none for this collection, so every tab of the console
 * except "All" answered with a 500 - "Could not load drivers" - while the
 * emulator, which does not enforce indexes, passed. And `orderBy('createdAt')`
 * silently drops any document without that field, which for a review queue
 * means an application nobody can see or decide. Two hundred records sort
 * themselves in memory in no time at all.
 */
export async function list(options: {
  status?: VerificationStatus;
}): Promise<DriverProfile[]> {
  let query = collection().limit(200);
  if (options.status) query = query.where('status', '==', options.status);

  const snapshot = await query.get();

  return snapshot.docs.map(toDriverProfile).sort(newestFirst);
}

/** Newest first, with records that never recorded a date last rather than lost. */
function newestFirst(a: DriverProfile, b: DriverProfile): number {
  if (a.createdAt === b.createdAt) return 0;
  if (a.createdAt === null) return 1;
  if (b.createdAt === null) return -1;
  return b.createdAt.localeCompare(a.createdAt);
}
