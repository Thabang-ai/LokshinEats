/**
 * Order persistence.
 *
 * Every state change runs inside a Firestore transaction and re-reads the
 * order before writing. That is not defensive habit — it is load-bearing:
 * two drivers tapping "accept" on the same order at the same moment, or a
 * vendor and an admin both cancelling, would otherwise interleave and leave
 * the order in a state neither of them chose.
 */

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import { ApiError } from '../../lib/ApiError';
import { buildPage, type Page } from '../../lib/pagination';
import { MAX_OTP_ATTEMPTS, verifyDeliveryCode } from '../../lib/otp';
import type { Role } from '../../middleware/auth';
import {
  canTransition,
  toOrder,
  type Audience,
  type Order,
  type OrderStatus,
} from './order.model';

const collection = () => db.collection(Collections.orders);

/** The complete server-computed document written at order creation. */
export type NewOrderDocument = {
  customerId: string;
  customerName: string;
  customerPhone: string;
  storeId: string;
  storeName: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    specialInstructions: string | null;
    lineTotal: number;
  }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  deliveryAddress: {
    street: string;
    city: string;
    postalCode: string;
    instructions: string | null;
  };
  deliveryCode: string;
  vendorPayout: number;
  driverPayout: number;
  platformEarnings: number;
  platformCommission: number;
  commissionRate: number;
  driverDeliveryShare: number;
};

export async function create(
  document: NewOrderDocument,
  audience: Audience,
): Promise<Order> {
  const ref = collection().doc();

  await ref.set({
    ...document,
    // Server-owned lifecycle fields. A client never supplies any of these.
    status: 'pending',
    // Always pending at creation, including for card orders. The old web
    // checkout wrote 'paid' straight away off the back of a simulated
    // gateway; here only a verified payment may move it.
    paymentStatus: 'pending',
    paymentTransactionId: null,
    // Explicit null so `where('driverId', '==', null)` matches for the
    // available-orders queue.
    driverId: null,
    deliveryVerified: false,
    deliveryCodeAttempts: 0,
    deliveredAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snapshot = await ref.get();
  return toOrder(snapshot, audience);
}

export async function findById(
  id: string,
  audience: Audience,
): Promise<Order | null> {
  const snapshot = await collection().doc(id).get();
  return snapshot.exists ? toOrder(snapshot, audience) : null;
}

/** Raw document read, for callers that need the fields the API hides. */
export async function findRawById(
  id: string,
): Promise<Record<string, unknown> | null> {
  const snapshot = await collection().doc(id).get();
  return snapshot.exists ? (snapshot.data() ?? null) : null;
}

type ListOptions = {
  limit: number;
  cursor?: string;
  status?: OrderStatus;
  audience: Audience;
};

/** Shared query builder: newest orders first, cursor-paginated. */
async function runList(
  build: (base: FirebaseFirestore.Query) => FirebaseFirestore.Query,
  options: ListOptions,
): Promise<Page<Order>> {
  let query = build(collection());

  if (options.status) {
    query = query.where('status', '==', options.status);
  }

  query = query.orderBy('createdAt', 'desc');

  if (options.cursor) {
    const cursorDoc = await collection().doc(options.cursor).get();
    // An unknown cursor yields the first page rather than an error: a
    // deleted order should not break a client mid-scroll.
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.limit(options.limit + 1).get();
  return buildPage(
    snapshot.docs.map((doc) => toOrder(doc, options.audience)),
    options.limit,
  );
}

export async function listForCustomer(
  customerId: string,
  options: ListOptions,
): Promise<Page<Order>> {
  return runList((base) => base.where('customerId', '==', customerId), options);
}

export async function listForStore(
  storeId: string,
  options: ListOptions,
): Promise<Page<Order>> {
  return runList((base) => base.where('storeId', '==', storeId), options);
}

export async function listForDriver(
  driverId: string,
  options: ListOptions,
): Promise<Page<Order>> {
  return runList((base) => base.where('driverId', '==', driverId), options);
}

/**
 * The unclaimed queue drivers pick from.
 *
 * Only `ready` orders appear: a driver claiming an order the kitchen has not
 * finished would sit waiting at the store, and the vendor could still cancel
 * it out from under them.
 */
export async function listAvailableForDrivers(
  options: ListOptions,
): Promise<Page<Order>> {
  return runList(
    (base) => base.where('driverId', '==', null).where('status', '==', 'ready'),
    { ...options, status: undefined },
  );
}

export async function listAll(options: ListOptions): Promise<Page<Order>> {
  return runList((base) => base, options);
}

/**
 * Apply a status change, re-checking the transition against the order's
 * current state inside the transaction.
 *
 * The caller has already checked the transition once, on data it read a
 * moment earlier. This second check is the one that counts, because only it
 * sees the state the write will actually apply to.
 */
export async function applyStatusChange(
  orderId: string,
  next: OrderStatus,
  actorRole: Role,
  audience: Audience,
): Promise<Order> {
  const ref = collection().doc(orderId);

  await db.runTransaction(async (transaction: Transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw ApiError.notFound('No such order.');

    const current = (snapshot.get('status') ?? 'pending') as OrderStatus;

    if (current === next) {
      throw ApiError.conflict(`This order is already ${next}.`);
    }
    if (!canTransition(current, next, actorRole)) {
      throw ApiError.conflict(
        `An order that is ${current} cannot be moved to ${next}.`,
      );
    }

    transaction.update(ref, {
      status: next,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const snapshot = await ref.get();
  return toOrder(snapshot, audience);
}

/**
 * Claim an unassigned order for a driver.
 *
 * The transaction is what makes this safe under contention: two drivers
 * accepting simultaneously both read `driverId === null`, but only one
 * transaction commits — the other retries, sees the assignment, and is told
 * the order is taken.
 */
export async function assignDriver(
  orderId: string,
  driverId: string,
): Promise<Order> {
  const ref = collection().doc(orderId);

  await db.runTransaction(async (transaction: Transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw ApiError.notFound('No such order.');

    const existingDriver = snapshot.get('driverId');
    if (existingDriver) {
      if (existingDriver === driverId) {
        throw ApiError.conflict('You have already accepted this order.');
      }
      throw ApiError.conflict('Another driver has already taken this order.');
    }

    const status = snapshot.get('status');
    if (status !== 'ready') {
      throw ApiError.conflict(
        'This order is not ready for collection yet.',
      );
    }

    transaction.update(ref, {
      driverId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const snapshot = await ref.get();
  return toOrder(snapshot, 'driver');
}

export type DeliveryResult =
  | { outcome: 'delivered'; order: Order }
  | { outcome: 'wrong_code'; attemptsRemaining: number };

/**
 * Close an order against the customer's delivery code.
 *
 * The comparison happens here, on the server, against a code the driver has
 * never been sent. The attempt counter lives on the order document and is
 * incremented inside the same transaction as the check, so parallel guesses
 * cannot race past the limit.
 */
export async function completeDelivery(
  orderId: string,
  driverId: string,
  submittedCode: string,
): Promise<DeliveryResult> {
  const ref = collection().doc(orderId);

  const result = await db.runTransaction(
    async (transaction: Transaction): Promise<DeliveryResult> => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw ApiError.notFound('No such order.');

      if (snapshot.get('driverId') !== driverId) {
        // Reported as "not found" so a driver cannot probe other orders.
        throw ApiError.notFound('No such order.');
      }

      const status = snapshot.get('status') as OrderStatus;
      if (status === 'delivered') {
        throw ApiError.conflict('This order is already delivered.');
      }
      if (status !== 'picked_up') {
        throw ApiError.conflict(
          'Collect the order before confirming delivery.',
        );
      }

      const attempts = Number(snapshot.get('deliveryCodeAttempts') ?? 0);
      if (attempts >= MAX_OTP_ATTEMPTS) {
        throw ApiError.forbidden(
          'Too many incorrect codes. Contact support to release this order.',
        );
      }

      const expected =
        snapshot.get('deliveryCode') ?? snapshot.get('deliveryOTP');

      if (!verifyDeliveryCode(submittedCode, expected)) {
        transaction.update(ref, {
          deliveryCodeAttempts: attempts + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {
          outcome: 'wrong_code',
          attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - (attempts + 1)),
        };
      }

      transaction.update(ref, {
        status: 'delivered',
        deliveryVerified: true,
        // Keep the legacy field in step so the existing web views, which read
        // deliveryOTPVerified, still show the order as complete.
        deliveryOTPVerified: true,
        deliveredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { outcome: 'delivered', order: toOrder(snapshot, 'driver') };
    },
  );

  if (result.outcome === 'wrong_code') return result;

  // Re-read outside the transaction so the response carries the committed
  // status and timestamps rather than the pre-update snapshot.
  const snapshot = await ref.get();
  return { outcome: 'delivered', order: toOrder(snapshot, 'driver') };
}

/**
 * Record the outcome of a payment attempt.
 *
 * Only the payments module calls this. It is the single write path that may
 * set `paymentStatus`, which is what keeps a client from declaring its own
 * order paid.
 */
export async function recordPayment(
  orderId: string,
  paymentStatus: 'paid' | 'failed' | 'refunded',
  transactionId: string | null,
): Promise<void> {
  await collection().doc(orderId).update({
    paymentStatus,
    paymentTransactionId: transactionId,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
