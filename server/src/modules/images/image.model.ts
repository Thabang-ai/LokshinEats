/**
 * What counts as an uploadable photograph.
 *
 * The ceiling is set by where these are kept: a Firestore document holds a
 * megabyte in total, so the bytes have to sit comfortably inside that with
 * room for the fields beside them. Phones are told to resize before sending,
 * and a photograph at 1200px wide and 70% quality lands around 150KB, so
 * 700KB is generous rather than tight.
 *
 * Uploads arrive as raw bytes with an image content type, not as base64 in
 * JSON: base64 would add a third again to every upload for nothing, and
 * these are sent over mobile data.
 */

import { ApiError } from '../../lib/ApiError';

/** Formats every phone and browser can produce and every client can show. */
export const IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

export const MAX_IMAGE_BYTES = 700 * 1024;

/**
 * The content type of an upload, or a refusal explaining what to send.
 *
 * A header can carry parameters (`image/jpeg; charset=binary`), so only the
 * type itself is compared.
 */
export function imageContentType(header: string | undefined): ImageContentType {
  const type = (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(type)) {
    throw ApiError.badRequest(
      `Send a photo as ${IMAGE_CONTENT_TYPES.join(', ')}.`,
    );
  }

  return type as ImageContentType;
}

/** Refuse an empty or oversized upload before it reaches the store. */
export function assertUploadable(bytes: Buffer | undefined): Buffer {
  if (!bytes || bytes.length === 0) {
    throw ApiError.badRequest('No photo was sent.');
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    throw ApiError.badRequest(
      `That photo is too big. Send one under ${Math.floor(
        MAX_IMAGE_BYTES / 1024,
      )}KB — resizing it on the phone is enough.`,
    );
  }

  return bytes;
}

/**
 * Where a stored photograph is served from.
 *
 * Relative, so what is written into a product outlives the API's hostname;
 * each app resolves it against the API it was built against. The version
 * makes the URL change whenever the photograph does, which is what lets the
 * response be cached hard.
 */
export function productImagePath(productId: string, version: number): string {
  return `/api/v1/products/${productId}/image?v=${version}`;
}
