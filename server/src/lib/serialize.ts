/**
 * Firestore <-> JSON conversion helpers.
 *
 * Firestore returns Timestamps, which serialise to `{_seconds, _nanoseconds}`
 * — awkward for Dart and JavaScript clients alike. Everything crossing the
 * API boundary is normalised to ISO-8601 strings instead.
 */

import { Timestamp } from 'firebase-admin/firestore';

/** Timestamp | Date | ISO string | null -> ISO string | null. */
export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  // Plain {_seconds} shapes appear in data written by older SDK versions.
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    const seconds = (value as { _seconds: number })._seconds;
    if (typeof seconds === 'number') {
      return new Date(seconds * 1000).toISOString();
    }
  }
  return null;
}

/** Read a numeric field, defaulting rather than emitting NaN downstream. */
export function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Read a boolean field with an explicit default. */
export function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Read a string field, collapsing null/undefined to a default. */
export function toStringOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
