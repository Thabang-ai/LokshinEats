/**
 * Store domain model.
 *
 * Field names match the documents the web app already writes (see
 * app/vendor/register/page.tsx) so existing stores deserialise unchanged.
 *
 * The split that matters here is between vendor-owned fields and derived
 * ones. `rating` and `reviewCount` are computed from the reviews collection,
 * and `ownerId` establishes who may edit the store at all — none of the three
 * appear in any client-writable schema, so a vendor cannot promote their own
 * rating or hand their store to someone else.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import {
  toBoolean,
  toIso,
  toNumber,
  toStringOr,
} from '../../lib/serialize';

export type Store = {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  ownerId: string;
  address: string;
  city: string;
  phone: string | null;
  email: string | null;
  openingTime: string | null;
  closingTime: string | null;
  categories: string[];
  image: string | null;
  logo: string | null;
  banner: string | null;
  /** Derived from reviews; never accepted from a client. */
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrderAmount: number;
  isOpen: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/** "HH:MM" in 24-hour form. */
const timeSchema = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Use 24-hour HH:MM, e.g. 08:30.');

const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+27|0)[1-8][0-9]{8}$/,
    'Enter a valid South African phone number.',
  );

/**
 * Money a vendor sets. Bounded rather than merely non-negative: a delivery
 * fee of R100 000 would be a data-entry accident that reaches customers.
 */
const feeSchema = z
  .number()
  .min(0, 'Fee may not be negative.')
  .max(1000, 'Fee is unrealistically high.')
  .multipleOf(0.01, 'Fee may not be finer than one cent.');

const baseStoreFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  cuisine: z.string().trim().min(2).max(60),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  phone: phoneSchema.optional(),
  email: z.string().trim().email().max(200).optional(),
  openingTime: timeSchema.optional(),
  closingTime: timeSchema.optional(),
  categories: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  logo: z.string().trim().url().max(500).optional(),
  banner: z.string().trim().url().max(500).optional(),
  deliveryTime: z.string().trim().min(3).max(40).default('30-45 min'),
  deliveryFee: feeSchema.default(15),
  minOrderAmount: feeSchema.default(30),
};

export const createStoreSchema = z.object(baseStoreFields).strict();
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

/**
 * Every field optional on update, but the set is the same. `ownerId`,
 * `rating`, and `reviewCount` are absent by construction.
 */
export const updateStoreSchema = z
  .object({
    ...baseStoreFields,
    name: baseStoreFields.name.optional(),
    description: z.string().trim().max(500).optional(),
    cuisine: baseStoreFields.cuisine.optional(),
    address: baseStoreFields.address.optional(),
    city: baseStoreFields.city.optional(),
    categories: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    deliveryTime: z.string().trim().min(3).max(40).optional(),
    deliveryFee: feeSchema.optional(),
    minOrderAmount: feeSchema.optional(),
    /** Vendors toggle this from the dashboard to stop taking orders. */
    isOpen: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export const storeIdParamSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const listStoresQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(200).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  cuisine: z.string().trim().min(1).max(60).optional(),
  /** Restrict to stores currently accepting orders. */
  openOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ListStoresQuery = z.infer<typeof listStoresQuerySchema>;

/** Firestore document -> API representation. */
export function toStore(snapshot: DocumentSnapshot): Store {
  const data = snapshot.data() ?? {};

  const optional = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

  return {
    id: snapshot.id,
    name: toStringOr(data.name),
    description: toStringOr(data.description),
    cuisine: toStringOr(data.cuisine),
    ownerId: toStringOr(data.ownerId),
    address: toStringOr(data.address),
    city: toStringOr(data.city),
    phone: optional(data.phone),
    email: optional(data.email),
    openingTime: optional(data.openingTime),
    closingTime: optional(data.closingTime),
    categories: Array.isArray(data.categories)
      ? data.categories.filter((c: unknown): c is string => typeof c === 'string')
      : [],
    image: optional(data.image),
    logo: optional(data.logo),
    banner: optional(data.banner),
    rating: toNumber(data.rating),
    reviewCount: toNumber(data.reviewCount),
    deliveryTime: toStringOr(data.deliveryTime, '30-45 min'),
    deliveryFee: toNumber(data.deliveryFee),
    minOrderAmount: toNumber(data.minOrderAmount),
    isOpen: toBoolean(data.isOpen),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
