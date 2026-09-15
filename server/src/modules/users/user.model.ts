/**
 * User domain model.
 *
 * Mirrors the `User` interface the web app already uses (types/index.ts) so
 * existing documents deserialise unchanged, with dates normalised to ISO
 * strings on the way out.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { ROLES, type Role } from '../../middleware/auth';
import { toIso, toStringOr } from '../../lib/serialize';

/**
 * A delivery address on a profile.
 *
 * The same `{ street, city, postalCode }` shape as an order's
 * `deliveryAddress`, and the shape the web profile page already writes
 * straight to Firestore. The API used to model this as a single string, so it
 * read every address that page saved back as null — and the Flutter app, which
 * reads profiles through the API, showed "Not set" for them.
 */
export type ProfileAddress = {
  street: string;
  city: string;
  postalCode: string;
};

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  address: ProfileAddress | null;
  role: Role;
  createdAt: string | null;
  updatedAt: string | null;
};

/** South African mobile numbers, local (0XX) or international (+27) form. */
const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+27|0)[6-8][0-9]{8}$/,
    'Enter a valid South African mobile number, e.g. 0821234567.',
  );

/**
 * An address a user may save. All three parts or none: a street with no city
 * cannot prefill a checkout, and checkout would reject it anyway.
 */
const profileAddressSchema = z
  .object({
    // Messages are the API's, written for customers: a form shows them as-is.
    street: z
      .string()
      .trim()
      .min(3, 'Enter your street address.')
      .max(200, 'That street address is too long.'),
    city: z
      .string()
      .trim()
      .min(2, 'Enter your town or city.')
      .max(80, 'That town or city name is too long.'),
    postalCode: z
      .string()
      .trim()
      .regex(/^[0-9]{4}$/, 'Enter a 4-digit postal code.'),
  })
  .strict();

/**
 * Fields a user may set on their own profile.
 *
 * `role` is deliberately absent: a customer who could PATCH their own role to
 * `admin` would own the platform. Role changes go through the admin-only
 * endpoint.
 */
export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    phone: phoneSchema.optional(),
    // `null` removes a saved address; leaving the key out keeps it.
    address: profileAddressSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Profile completed straight after Firebase Auth sign-up. */
export const createProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    phone: phoneSchema.optional(),
    address: profileAddressSchema.optional(),
    // Customers and drivers self-select at sign-up. Vendor and admin are not
    // self-assignable: a vendor account is promoted once its store is
    // approved, and admin is granted out of band.
    role: z.enum(['customer', 'driver']).default('customer'),
  })
  .strict();

export type CreateProfileInput = z.infer<typeof createProfileSchema>;

/** Admin-only role assignment. */
export const setRoleSchema = z
  .object({ role: z.enum(ROLES) })
  .strict();

export const userIdParamSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

/** Firestore document -> API representation. */
export function toUserProfile(snapshot: DocumentSnapshot): UserProfile {
  const data = snapshot.data() ?? {};
  const role = data.role;

  return {
    id: snapshot.id,
    email: toStringOr(data.email),
    displayName: toStringOr(data.displayName),
    phone: typeof data.phone === 'string' && data.phone ? data.phone : null,
    address: toProfileAddress(data.address),
    role: (ROLES as readonly string[]).includes(role)
      ? (role as Role)
      : 'customer',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/**
 * Read a stored address in either of the shapes that exist.
 *
 *  - `{ street, city, postalCode }` — the web profile page, and this API from
 *    now on.
 *  - A single string — what this API wrote before. There is no telling which
 *    part is the city, so the whole line is kept as the street rather than
 *    guessed at or dropped.
 *
 * Anything else, or an object with every part empty, reads as no address.
 */
export function toProfileAddress(value: unknown): ProfileAddress | null {
  if (typeof value === 'string') {
    const street = value.trim();
    return street ? { street, city: '', postalCode: '' } : null;
  }

  if (value !== null && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    const read = (part: unknown) => (typeof part === 'string' ? part.trim() : '');
    const address = {
      street: read(raw.street),
      city: read(raw.city),
      postalCode: read(raw.postalCode),
    };
    return address.street || address.city || address.postalCode
      ? address
      : null;
  }

  return null;
}
