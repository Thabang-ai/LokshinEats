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

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  address: string | null;
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
    address: z.string().trim().min(3).max(200).optional(),
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
    address: z.string().trim().min(3).max(200).optional(),
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
    address:
      typeof data.address === 'string' && data.address ? data.address : null,
    role: (ROLES as readonly string[]).includes(role)
      ? (role as Role)
      : 'customer',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
