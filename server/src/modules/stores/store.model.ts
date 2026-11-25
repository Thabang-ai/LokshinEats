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

/** As many areas as a kitchen can plausibly cover with one driver. */
export const MAX_DELIVERY_AREAS = 20;

/**
 * One area name reduced to what distinguishes it.
 *
 * Nobody types a township the same way twice - "Meadowlands ", "meadowlands",
 * "Meadow lands" - and a customer whose address says one of them must not be
 * turned away by a kitchen that typed another. Case and spacing are noise;
 * the letters are the name.
 */
export function areaKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The areas a kitchen delivers to, including the ground it stands on.
 *
 * A kitchen that lists areas and forgets its own township has not decided to
 * stop serving its neighbours; it has forgotten. Adding it here rather than
 * at the point of the check means every surface - the vendor's own list, the
 * customer's kitchen page, the refusal message - shows exactly what is
 * enforced.
 */
export function withOwnCity(areas: string[], city: string): string[] {
  const named = areas.filter((area) => area.trim().length > 0);
  if (named.length === 0) return [];

  const own = city.trim();
  const keys = new Set(named.map(areaKey));

  return own.length > 0 && !keys.has(areaKey(own)) ? [own, ...named] : named;
}

/**
 * Whether this kitchen will send a driver to `area`.
 *
 * An empty list means no limit, not "nowhere". Every kitchen trading today
 * was registered before delivery areas existed and carries no list at all,
 * and reading that absence as "nowhere" would refuse every order on the
 * platform.
 */
export function deliversTo(
  store: { deliveryAreas: string[] },
  area: string,
): boolean {
  if (store.deliveryAreas.length === 0) return true;

  const key = areaKey(area);
  return store.deliveryAreas.some((listed) => areaKey(listed) === key);
}

/** "Meadowlands, Dobsonville and Soweto" - for telling somebody why. */
export function listAreas(areas: string[]): string {
  if (areas.length <= 1) return areas.join('');
  return `${areas.slice(0, -1).join(', ')} and ${areas[areas.length - 1]}`;
}

/**
 * The day the browser stopped being able to create a kitchen.
 *
 * Until 25 November 2026 the website wrote the store document itself, with no
 * `verification` field, and a missing field reads as approved - so
 * registering through the website skipped the review queue. Registration goes
 * through the API now and `firestore.rules` refuses client writes, but the
 * grandfathering is gated on this date as well: a kitchen with no status
 * created after it did not come from a path that is allowed to exist, and is
 * treated as waiting rather than approved.
 *
 * Deliberately not earlier. Kitchens registered through the old page before
 * this date have been trading for weeks, and moving the date back would close
 * them on deploy - the exact mistake the grandfathering exists to avoid.
 */
const CLIENT_WRITES_CLOSED = Date.parse('2026-11-25T00:00:00+02:00');

/**
 * Whether LokshinEats has let this kitchen trade.
 *
 * A kitchen with no field at all predates the review queue (see
 * [CLIENT_WRITES_CLOSED]); a kitchen with no field and no `createdAt` is
 * older still. Both read as approved: closing a kitchen that is already
 * trading is worse than reviewing one late.
 */
function verificationOf(data: Record<string, unknown>): StoreVerificationStatus {
  if ((STORE_VERIFICATION_STATUSES as readonly string[]).includes(
    data.verification as string,
  )) {
    return data.verification as StoreVerificationStatus;
  }

  const created = toIso(data.createdAt);
  const createdAt = created === null ? Number.NaN : Date.parse(created);

  return Number.isNaN(createdAt) || createdAt < CLIENT_WRITES_CLOSED
    ? 'approved'
    : 'pending';
}

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
  /**
   * The areas this kitchen delivers to, its own city included.
   *
   * Empty means no limit: it will go wherever a driver will take it. That is
   * every kitchen registered before this field existed.
   */
  deliveryAreas: string[];
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

/**
 * The areas a kitchen says it delivers to.
 *
 * Free text rather than a fixed list of townships: LokshinEats does not know
 * every area it will ever operate in, and a vendor who cannot name their own
 * neighbourhood would be stuck. Duplicates are dropped here so a vendor who
 * types "Soweto" twice gets one entry rather than an error.
 */
const deliveryAreasSchema = z
  .array(
    z
      .string()
      .trim()
      .min(2, 'An area needs a name.')
      .max(80, 'That area name is too long.'),
  )
  .max(MAX_DELIVERY_AREAS, 'That is more areas than one kitchen can cover.')
  .transform((areas) => {
    const seen = new Set<string>();
    return areas.filter((area) => {
      const key = areaKey(area);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

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
  /** Empty means no limit, which is where every kitchen starts. */
  deliveryAreas: deliveryAreasSchema.default([]),
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
    /**
     * Where the kitchen delivers. Sending `[]` lifts the limit rather than
     * refusing everybody, which is what an empty list has always meant.
     */
    deliveryAreas: deliveryAreasSchema.optional(),
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
  /**
   * Restrict to kitchens that deliver to this area.
   *
   * Not the same question as `city`, which asks where the kitchen stands. A
   * customer in Dobsonville wants the kitchen one township over that will
   * drive to them, and does not want the one next door that will not.
   */
  deliversTo: z.string().trim().min(1).max(80).optional(),
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
    verification: verificationOf(data),
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
    // Served with the kitchen's own city folded in, so the list every
    // surface shows is the list the API enforces.
    deliveryAreas: withOwnCity(
      Array.isArray(data.deliveryAreas)
        ? data.deliveryAreas.filter(
            (area: unknown): area is string => typeof area === 'string',
          )
        : [],
      toStringOr(data.city),
    ),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
