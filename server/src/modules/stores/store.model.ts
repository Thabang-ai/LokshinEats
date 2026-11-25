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

/**
 * How a kitchen decides whether it is open.
 *
 * `manual` is the switch on the vendor's own dashboard and nothing else -
 * what every kitchen has done until now. `scheduled` adds the hours: the
 * kitchen is open when the clock agrees, and the switch still closes it
 * early when the pots run out.
 *
 * Existing kitchens stay `manual`. Their opening hours were collected at
 * registration and have never meant anything, so enforcing them now would
 * close a kitchen at 18:00 on the strength of a number somebody typed months
 * ago and has never thought about since.
 */
export const STORE_HOURS_MODES = ['manual', 'scheduled'] as const;
export type StoreHoursMode = (typeof STORE_HOURS_MODES)[number];

/** Anything we have not been told reads as the way kitchens worked before. */
function hoursMode(value: unknown): StoreHoursMode {
  return (STORE_HOURS_MODES as readonly string[]).includes(value as string)
    ? (value as StoreHoursMode)
    : 'manual';
}

/** Minutes past midnight for "HH:MM", or null if it is not a time. */
function minutesInto(time: string | null): number | null {
  if (!time) return null;
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes past midnight in Johannesburg, which is where the kitchens are. */
function nowInSast(at: Date): number {
  const sast = new Date(at.getTime() + 2 * 60 * 60 * 1000);
  return sast.getUTCHours() * 60 + sast.getUTCMinutes();
}

/**
 * Whether the clock says this kitchen is open.
 *
 * A closing time earlier than the opening time means the kitchen trades past
 * midnight - 18:00 to 02:00 is an ordinary night for a kota place, and
 * reading it as a fourteen-hour closure would shut exactly the kitchens that
 * are busiest.
 */
export function withinHours(
  openingTime: string | null,
  closingTime: string | null,
  at: Date = new Date(),
): boolean {
  const opens = minutesInto(openingTime);
  const closes = minutesInto(closingTime);

  // Hours nobody has given cannot close anybody.
  if (opens === null || closes === null) return true;
  if (opens === closes) return true;

  const now = nowInSast(at);
  return opens < closes
    ? now >= opens && now < closes
    : now >= opens || now < closes;
}

/**
 * Whether a kitchen is taking orders: its own switch, and the clock when it
 * has asked the clock to decide.
 */
export function isTakingOrders(
  store: {
    switchedOn: boolean;
    hoursMode: StoreHoursMode;
    openingTime: string | null;
    closingTime: string | null;
  },
  at: Date = new Date(),
): boolean {
  if (!store.switchedOn) return false;
  if (store.hoursMode !== 'scheduled') return true;
  return withinHours(store.openingTime, store.closingTime, at);
}

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
  /**
   * Whether this kitchen is taking orders right now.
   *
   * The answer, not the switch: on `scheduled` hours a kitchen whose switch
   * is on but whose clock says closed reads false here. Every customer-facing
   * surface already asks this question, so they all get the hours for free.
   */
  isOpen: boolean;
  /** The vendor's own switch, for the vendor's own dashboard. */
  switchedOn: boolean;
  hoursMode: StoreHoursMode;
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
    /** Let the hours decide, or keep the switch in charge. */
    hoursMode: z.enum(STORE_HOURS_MODES).optional(),
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
    isOpen: isTakingOrders({
      switchedOn: toBoolean(data.isOpen),
      hoursMode: hoursMode(data.hoursMode),
      openingTime: optional(data.openingTime),
      closingTime: optional(data.closingTime),
    }),
    switchedOn: toBoolean(data.isOpen),
    hoursMode: hoursMode(data.hoursMode),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
