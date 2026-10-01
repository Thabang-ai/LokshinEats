/**
 * Notifications and device tokens in Firestore.
 *
 * Neither collection matches a security rule, so no client can read or write
 * them directly: every read goes through the API, scoped to its caller.
 */

import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import { buildPage, type Page } from '../../lib/pagination';
import {
  toNotification,
  type Notification,
  type NotificationMessage,
} from './notification.model';

const notifications = () => db.collection(Collections.notifications);
const devices = () => db.collection(Collections.deviceTokens);

/**
 * Store a notification, once.
 *
 * Keyed to the order and the moment, so the same event reported twice - a
 * retried request, a hook that runs again - writes one notification and
 * pushes it once. Returns false when it already existed.
 */
export async function createOnce(input: {
  userId: string;
  orderId: string | null;
  message: NotificationMessage;
}): Promise<{ created: boolean; notification: Notification }> {
  const id = input.orderId
    ? `${input.orderId}__${input.message.kind}`
    : `${input.userId}__${input.message.kind}__${Date.now()}`;
  const ref = notifications().doc(id);

  const created = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return false;

    tx.set(ref, {
      userId: input.userId,
      orderId: input.orderId,
      kind: input.message.kind,
      title: input.message.title,
      body: input.message.body,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    });
    return true;
  });

  return { created, notification: toNotification(await ref.get()) };
}

export async function listForUser(
  userId: string,
  options: { limit: number; cursor?: string },
): Promise<Page<Notification>> {
  let query = notifications()
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc');

  if (options.cursor) {
    const cursorDoc = await notifications().doc(options.cursor).get();
    // Only continue from a cursor that is the caller's own notification.
    if (cursorDoc.exists && cursorDoc.get('userId') === userId) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.limit(options.limit + 1).get();
  return buildPage(snapshot.docs.map(toNotification), options.limit);
}

export async function countUnread(userId: string): Promise<number> {
  const snapshot = await notifications()
    .where('userId', '==', userId)
    .where('readAt', '==', null)
    .count()
    .get();
  return snapshot.data().count;
}

/**
 * Mark one of the caller's notifications read.
 *
 * Someone else's notification is reported as missing, not forbidden, so ids
 * cannot be probed.
 */
export async function markRead(
  userId: string,
  id: string,
): Promise<Notification | null> {
  const ref = notifications().doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get('userId') !== userId) return null;

  if (snapshot.get('readAt') == null) {
    await ref.update({ readAt: FieldValue.serverTimestamp() });
  }
  return toNotification(await ref.get());
}

export async function markAllRead(userId: string): Promise<number> {
  const unread = await notifications()
    .where('userId', '==', userId)
    .where('readAt', '==', null)
    .get();

  // Batches cap at 500 writes; an inbox is far smaller, but be correct.
  for (let i = 0; i < unread.docs.length; i += 450) {
    const batch = db.batch();
    for (const doc of unread.docs.slice(i, i + 450)) {
      batch.update(doc.ref, { readAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
  return unread.size;
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/**
 * A token as a document id.
 *
 * Tokens are long and contain characters a document id should not rely on,
 * so they are stored under their hash, with the token itself as a field.
 */
function deviceId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Register a device for push.
 *
 * Keyed by the token, not the user, so a phone that signs out of one account
 * and into another moves to the new account rather than receiving both.
 */
export async function upsertDevice(input: {
  userId: string;
  token: string;
  platform: string;
}): Promise<void> {
  await devices().doc(deviceId(input.token)).set({
    userId: input.userId,
    token: input.token,
    platform: input.platform,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Forget a device, but only if it is the caller's. */
export async function removeDevice(userId: string, token: string): Promise<void> {
  const ref = devices().doc(deviceId(token));
  const snapshot = await ref.get();
  if (snapshot.exists && snapshot.get('userId') === userId) {
    await ref.delete();
  }
}

export async function tokensFor(userId: string): Promise<string[]> {
  const snapshot = await devices().where('userId', '==', userId).get();
  return snapshot.docs
    .map((doc) => doc.get('token'))
    .filter((token): token is string => typeof token === 'string');
}

/** Drop tokens the push service says will never deliver again. */
export async function forgetTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const batch = db.batch();
  for (const token of tokens) batch.delete(devices().doc(deviceId(token)));
  await batch.commit();
}
