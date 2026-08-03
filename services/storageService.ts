// Storage Service
// Uploads vendor-facing photos (product images, store logo/banner) to
// Firebase Storage and returns a public download URL to save on the
// Firestore doc. Requires the project's Blaze plan — Storage buckets can't
// be provisioned on Spark (see firebase/storage.rules for the security
// model this pairs with).

import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase/config';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — generous for a phone photo, small enough for mobile data

export class ImageValidationError extends Error {}

function assertValidImage(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new ImageValidationError('Please choose an image file (JPG, PNG, etc.)');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageValidationError('Image is too large — please choose one under 5MB.');
  }
}

/**
 * Upload an image to `path` and return its public download URL.
 *
 * `ownerId` is written as Storage custom metadata and is what
 * firebase/storage.rules checks against `request.auth.uid` — every path
 * this app writes to (stores/{storeId}/..., products/{storeId}/...) is
 * ownership-gated this same way, so callers must always pass the
 * uploading user's own uid.
 */
export async function uploadImage(file: File, path: string, ownerId: string): Promise<string> {
  assertValidImage(file);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { customMetadata: { ownerId } });
  return getDownloadURL(storageRef);
}

/** File extension to use for a storage path, defaulting to jpg for exotic/missing types. */
export function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop();
  if (fromName && /^[a-zA-Z0-9]{2,5}$/.test(fromName)) return fromName.toLowerCase();
  const fromType = file.type.split('/')[1];
  return fromType || 'jpg';
}
