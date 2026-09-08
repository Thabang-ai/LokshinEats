/**
 * Order domain model.
 *
 * This is where the client stops being trusted. A client places an order by
 * sending a basket and an address and nothing else: no prices, no totals, no
 * payout figures, no payment status, no delivery code. Every one of those is
 * decided by the server.
 *
 * Field names match the documents the web app already writes (see
 * app/checkout/page.tsx), so existing orders deserialise unchanged and the
 * admin console keeps working against both old and new records.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { toIso, toNumber, toStringOr } from '../../lib/serialize';
import type { Role } from '../../middleware/auth';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['cash', 'yoco', 'ozow'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Who may move an order from one status to the next.
 *
 * Encoding the lifecycle as data rather than as scattered conditionals means
 * it can be read in one place and tested exhaustively. A missing key means
 * the status is terminal.
 *
 * `delivered` is deliberately unreachable here: it requires the delivery-code
 * endpoint, so a driver cannot mark an order delivered by sending a plain
 * status update.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Partial<Record<OrderStatus, Partial<Record<OrderStatus, readonly Role[]>>>>
> = Object.freeze({
  pending: {
    // The vendor dashboard's "Accept Order" goes straight to `preparing` —
    // there is no separate confirm step in the UI, and requiring one made
    // accepting an order fail with a 409. `confirmed` stays reachable because
    // orders already in the database use it and drivers can claim it.
    preparing: ['vendor', 'admin'],
    confirmed: ['vendor', 'admin'],
    cancelled: ['customer', 'vendor', 'admin'],
  },
  confirmed: {
    preparing: ['vendor', 'admin'],
    cancelled: ['vendor', 'admin'],
  },
  preparing: {
    ready: ['vendor', 'admin'],
    cancelled: ['vendor', 'admin'],
  },
  ready: {
    picked_up: ['driver', 'admin'],
    cancelled: ['admin'],
  },
  picked_up: {
    // `delivered` is intentionally absent — see the note above.
    cancelled: ['admin'],
  },
});

/** True when `actor` may move an order from `from` to `to`. */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: Role,
): boolean {
  const roles = ALLOWED_TRANSITIONS[from]?.[to];
  return Array.isArray(roles) && roles.includes(actor);
}

export type OrderItem = {
  productId: string;
  name: string;
  /** Unit price at the moment the order was placed, read from the product. */
  price: number;
  quantity: number;
  specialInstructions: string | null;
  lineTotal: number;
};

export type DeliveryAddress = {
  street: string;
  city: string;
  postalCode: string;
  instructions: string | null;
};

export type Order = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  storeId: string;
  storeName: string;
  driverId: string | null;
  items: OrderItem[];
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentTransactionId: string | null;
  deliveryAddress: DeliveryAddress;
  /** Present only for the order's own customer, and for admins. */
  deliveryCode?: string;
  deliveryVerified: boolean;
  /** Note the customer will pay with, for driver change. Cash orders only. */
  cashAmount: number | null;
  /** Cash settlement between driver, vendor and platform. */
  cashGivenToVendor: boolean;
  cashGivenAmount: number | null;
  vendorCashConfirmed: boolean;
  vendorCashDisputed: boolean;
  /** Store-to-customer estimate, used to filter by driver vehicle range. */
  estimatedDistanceKm: number | null;
  /** Frozen platform economics. Never accepted from a client. */
  vendorPayout: number;
  driverPayout: number;
  platformEarnings: number;
  platformCommission: number;
  commissionRate: number;
  driverDeliveryShare: number;
  createdAt: string | null;
  updatedAt: string | null;
  deliveredAt: string | null;
};

const addressSchema = z
  .object({
    street: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(80),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Enter a 4-digit postal code.'),
    instructions: z.string().trim().max(300).optional(),
  })
  .strict();

/**
 * What a client may send when placing an order.
 *
 * Note what is absent: price, subtotal, total, deliveryFee, every payout
 * field, paymentStatus, and the delivery code. The server derives all of
 * them from the store and product records.
 *
 * `.strict()` matters here. Sending one of those fields is a validation
 * error rather than a silently ignored key, so a client still using the old
 * checkout shape fails loudly instead of appearing to work.
 */
export const createOrderSchema = z
  .object({
    storeId: z.string().trim().min(1).max(128),
    items: z
      .array(
        z
          .object({
            productId: z.string().trim().min(1).max(128),
            quantity: z.number().int().min(1).max(50),
            specialInstructions: z.string().trim().max(300).optional(),
          })
          .strict(),
      )
      .min(1, 'An order needs at least one item.')
      .max(50, 'That is too many line items for one order.'),
    deliveryAddress: addressSchema,
    paymentMethod: z.enum(PAYMENT_METHODS),
    customerPhone: z
      .string()
      .trim()
      .regex(
        /^(?:\+27|0)[6-8][0-9]{8}$/,
        'Enter a valid South African mobile number.',
      ),
    /**
     * For cash orders: the note the customer intends to pay with, so the
     * driver knows whether to bring change.
     *
     * This is a logistics hint, not a price. It never affects what is
     * charged, and the service rejects it on a card order and rejects an
     * amount below the total.
     */
    cashAmount: z
      .number()
      .min(0)
      .max(10_000)
      .multipleOf(0.01, 'Cash amount may not be finer than one cent.')
      .optional(),
  })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateStatusSchema = z
  .object({ status: z.enum(ORDER_STATUSES) })
  .strict();

export const completeDeliverySchema = z
  .object({
    /**
     * Optional only so that orders placed before delivery codes existed can
     * still be closed — those have no code stored and nothing to type. For
     * every normal order an absent code is simply a wrong one.
     */
    code: z
      .string()
      .trim()
      .regex(/^\d{4,6}$/, 'Enter the delivery code from the customer.')
      .optional(),
  })
  .strict();

export const cashReceiptSchema = z
  .object({ outcome: z.enum(['confirm', 'dispute']) })
  .strict();

export const orderIdParamSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const listOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(200).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

/** Who is reading an order, which decides what they are allowed to see. */
export type Audience = 'customer' | 'vendor' | 'driver' | 'admin';

function toOrderItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    // Orders written by the web checkout nest the whole product object.
    const product = (item.product ?? {}) as Record<string, unknown>;

    const price = toNumber(item.price ?? product.price);
    const quantity = toNumber(item.quantity, 1);

    return {
      productId: toStringOr(item.productId ?? product.id),
      name: toStringOr(item.name ?? product.name),
      price,
      quantity,
      specialInstructions:
        typeof item.specialInstructions === 'string' &&
        item.specialInstructions.length > 0
          ? item.specialInstructions
          : null,
      lineTotal: toNumber(
        item.lineTotal,
        Math.round(price * quantity * 100) / 100,
      ),
    };
  });
}

/**
 * Firestore document to API representation, scoped to its audience.
 *
 * The delivery code is attached only for the order's own customer and for
 * admins. Drivers and vendors never receive it in any response, which is what
 * stops a driver reading the code and closing the order themselves.
 */
export function toOrder(snapshot: DocumentSnapshot, audience: Audience): Order {
  const data = snapshot.data() ?? {};

  const status = ORDER_STATUSES.includes(data.status as OrderStatus)
    ? (data.status as OrderStatus)
    : 'pending';

  const paymentStatus = PAYMENT_STATUSES.includes(
    data.paymentStatus as PaymentStatus,
  )
    ? (data.paymentStatus as PaymentStatus)
    : 'pending';

  const address = (data.deliveryAddress ?? {}) as Record<string, unknown>;

  const order: Order = {
    id: snapshot.id,
    customerId: toStringOr(data.customerId),
    customerName: toStringOr(data.customerName),
    customerPhone:
      typeof data.customerPhone === 'string' && data.customerPhone
        ? data.customerPhone
        : null,
    storeId: toStringOr(data.storeId),
    storeName: toStringOr(data.storeName),
    driverId:
      typeof data.driverId === 'string' && data.driverId ? data.driverId : null,
    items: toOrderItems(data.items),
    status,
    subtotal: toNumber(data.subtotal),
    deliveryFee: toNumber(data.deliveryFee),
    total: toNumber(data.total),
    paymentMethod: PAYMENT_METHODS.includes(data.paymentMethod as PaymentMethod)
      ? (data.paymentMethod as PaymentMethod)
      : 'cash',
    paymentStatus,
    paymentTransactionId:
      typeof data.paymentTransactionId === 'string'
        ? data.paymentTransactionId
        : null,
    deliveryAddress: {
      street: toStringOr(address.street),
      city: toStringOr(address.city),
      postalCode: toStringOr(address.postalCode),
      instructions:
        typeof address.instructions === 'string' && address.instructions
          ? address.instructions
          : null,
    },
    // `deliveryOTPVerified` is the field name the existing documents use.
    deliveryVerified:
      data.deliveryVerified === true || data.deliveryOTPVerified === true,
    cashAmount:
      typeof data.cashAmount === 'number' && Number.isFinite(data.cashAmount)
        ? data.cashAmount
        : null,
    cashGivenToVendor: data.cashGivenToVendor === true,
    cashGivenAmount:
      typeof data.cashGivenAmount === 'number' &&
      Number.isFinite(data.cashGivenAmount)
        ? data.cashGivenAmount
        : null,
    vendorCashConfirmed: data.vendorCashConfirmed === true,
    vendorCashDisputed: data.vendorCashDisputed === true,
    estimatedDistanceKm:
      typeof data.estimatedDistanceKm === 'number' &&
      Number.isFinite(data.estimatedDistanceKm)
        ? data.estimatedDistanceKm
        : null,
    vendorPayout: toNumber(data.vendorPayout),
    driverPayout: toNumber(data.driverPayout),
    platformEarnings: toNumber(data.platformEarnings),
    platformCommission: toNumber(data.platformCommission),
    commissionRate: toNumber(data.commissionRate),
    driverDeliveryShare: toNumber(data.driverDeliveryShare),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    deliveredAt: toIso(data.deliveredAt),
  };

  if (audience === 'customer' || audience === 'admin') {
    // `deliveryOTP` is the field name on documents the web app wrote.
    const code = data.deliveryCode ?? data.deliveryOTP;
    if (typeof code === 'string' && code.length > 0) {
      order.deliveryCode = code;
    }
  }

  return order;
}
