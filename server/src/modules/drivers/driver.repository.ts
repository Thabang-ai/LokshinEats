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
 */
export async function list(options: {
  status?: VerificationStatus;
}): Promise<DriverProfile[]> {
  let query = collection().orderBy('createdAt', 'desc').limit(200);
  if (options.status) query = query.where('status', '==', options.status);

  const snapshot = await query.get();
  return snapshot.docs.map(toDriverProfile);
}
