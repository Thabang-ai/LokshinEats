/**
 * Where uploaded photographs live, behind one small interface.
 *
 * Firebase Storage is the obvious home for these and is not available: the
 * project is on the Spark plan, which cannot provision a bucket (the bucket
 * `kasieats-34391.firebasestorage.app` answers 404). That is why the
 * website's vendor upload has never worked — it throws before the product is
 * written, so choosing a photo loses the whole submission.
 *
 * So photographs are kept in Firestore instead: a document per image, in a
 * collection of their own so a menu listing never drags the bytes along with
 * it. A document is capped at 1MB by Firestore, which is the real reason
 * uploads are limited below that — phones send a resized photograph of
 * 100-200KB, and the cap is generous against it.
 *
 * Swappable the same way payment and push providers are. If the project ever
 * moves to Blaze, a `firebase-storage` implementation drops in here and
 * nothing above this file changes.
 */

import { Buffer } from 'node:buffer';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';

export type StoredImage = {
  bytes: Buffer;
  contentType: string;
  /** When it was last written, used to bust caches on the stored URL. */
  version: number;
};

export interface ImageStore {
  readonly name: string;
  put(key: string, image: Omit<StoredImage, 'version'>): Promise<number>;
  get(key: string): Promise<StoredImage | null>;
  remove(key: string): Promise<void>;
}

const collection = () => db.collection(Collections.images);

export const firestoreImageStore: ImageStore = {
  name: 'firestore',

  async put(key, image) {
    await collection().doc(key).set({
      bytes: image.bytes,
      contentType: image.contentType,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Read back rather than trusting the clock here: the version ends up in
    // the URL customers cache, and the server's timestamp is the one that
    // orders writes.
    const written = await collection().doc(key).get();
    return versionOf(written.get('updatedAt'));
  },

  async get(key) {
    const snapshot = await collection().doc(key).get();
    if (!snapshot.exists) return null;

    const bytes = snapshot.get('bytes');
    const contentType = snapshot.get('contentType');
    if (!bytes || typeof contentType !== 'string') return null;

    return {
      // The Admin SDK hands bytes back as a Buffer already; this is for the
      // emulator, which can return a Uint8Array.
      bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
      contentType,
      version: versionOf(snapshot.get('updatedAt')),
    };
  },

  async remove(key) {
    await collection().doc(key).delete();
  },
};

function versionOf(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}

let active: ImageStore | null = null;

export function imageStore(): ImageStore {
  active ??= firestoreImageStore;
  return active;
}

/** For tests: store images somewhere that forgets them afterwards. */
export function useImageStore(store: ImageStore): void {
  active = store;
}

export function resetImageStore(): void {
  active = null;
}
