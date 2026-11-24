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
import { DELIVERY_FEE } from '../../lib/money';

/**
 * Whether LokshinEats has let this kitchen trade.
 *
 * A kitchen used to be live the moment somebody filled in a form: no
 * check that the business exists, that the address is real, or that anyone
 * at all had looked at it. Drivers have been reviewed since October; this is
 * the same gate on the other side of the order.
 */
export const STORE_VERIFICATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;
export type StoreVerificationStatus =
  (typeof STORE_VERIFICATION_STATUSES)[number];

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
  /**
   * What delivery costs from this kitchen. A platform rule, the same
   * everywhere, and never accepted from a client: a vendor setting their own
   * fee set the driver's pay with it.
   */
  deliveryFee: number;
  /** Whether an admin has let this kitchen trade. */
  verification: StoreVerificationStatus;
  /** Why it was turned down, in the reviewer's words. Shown to the vendor. */
  verificationReason: string | null;
  verifiedAt: string | null;
  /** The admin who decided. Not shown to the vendor. */
  verifiedBy: string | null;
  /** Derived from reviews; never accepted from a client. */
  rating: number;
  reviewCount: number;
  deliveryTime: string;
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
    minOrderAmount: feeSchema.optional(),
    /** Vendors toggle this from the dashboard to stop taking orders. */
    isOpen: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

/**
 * An admin's decision on a kitchen.
 *
 * A refusal has to say why: the vendor is shown it, and one that says
 * nothing is a registration they will send again unchanged.
 */
export const decideStoreSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(5).max(300).optional(),
  })
  .strict()
  .refine((input) => input.decision === 'approve' || input.reason !== undefined, {
    path: ['reason'],
    message: 'Tell the kitchen why it was turned down.',
  });

export const listStoresAdminSchema = z.object({
  status: z.enum(STORE_VERIFICATION_STATUSES).optional(),
});

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
    // The platform's fee, not whatever this document happens to hold. Stores
    // registered before 22 November 2026 still carry their own figure, and
    // serving it would have a kitchen's page quote R20 while checkout charges
    // R12.
    deliveryFee: DELIVERY_FEE,
    // A kitchen with no verification field predates the review queue and has
    // been trading for weeks. Reading it as 'pending' would close every
    // kitchen on the platform the moment this deployed, so the absent value
    // means approved; only documents written from now on say 'pending'.
    verification: (STORE_VERIFICATION_STATUSES as readonly string[]).includes(
      data.verification,
    )
      ? (data.verification as StoreVerificationStatus)
      : 'approved',
    verificationReason:
      typeof data.verificationReason === 'string' && data.verificationReason
        ? data.verificationReason
        : null,
    verifiedAt: toIso(data.verifiedAt),
    verifiedBy:
      typeof data.verifiedBy === 'string' && data.verifiedBy
        ? data.verifiedBy
        : null,
    minOrderAmount: toNumber(data.minOrderAmount),
    isOpen: toBoolean(data.isOpen),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
