'use client';

// Turning a stored image value into a URL this page can load.
//
// Photos reach us in three shapes:
//
//   https://.../banner.jpeg       an absolute URL — usable as it is
//   /api/v1/products/x/image?v=1  a photo a vendor uploaded, served by the API
//   /img/kasi-kota.jpeg           a file this site serves from its own public
//                                 folder
//
// The middle one is the reason this exists. The API is a different origin
// from the website, so a browser resolving that path against the page would
// ask the website for it and get a 404 — a photo that uploaded perfectly and
// then would not show.

import { apiBaseUrl } from './apiClient';

/** The URL to put in an `<img src>`, or null when there is no photo. */
export function imageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (raw.length === 0) return null;

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/api/')) return `${apiBaseUrl()}${raw}`;
  if (raw.startsWith('/')) return raw;

  // An emoji placeholder, which the caller renders as text instead.
  return null;
}
