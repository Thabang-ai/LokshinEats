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

/**
 * Statuses at which a driver may claim an order.
 *
 * Deliberately wider than `ready`: a driver can claim as soon as the vendor
 * accepts, so they can start heading to the store while the food is still
 * being made rather than only finding out once it is sitting done. Claiming
 * early sets `driverId` and nothing else — the vendor still drives the status.
 */
const CLAIMABLE_STATUSES: readonly OrderStatus[] = [
  'confirmed',
  'preparing',
  'ready',
];


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
  cashAmount: number | null;
  estimatedDistanceKm: number | null;
  vendorPayout: number;
  driverPayout: number;
  platformEarnings: number;
  platformCommission: number;
  commissionRate: number;
  driverDeliveryShare: number;
};

const secrets = () => db.collection(Collections.orderSecrets);

/**
 * The delivery code for an order, or null when there is none.
 *
 * New orders keep it in `orderSecrets`, which no client can read. Orders
 * placed before that still carry it on the order document, so the fallback
 * keeps historical deliveries working — those remain visible to their driver,
 * which is exactly why new ones are stored apart.
 */
export async function findDeliveryCode(
  orderId: string,
): Promise<string | null> {
  const secret = await secrets().doc(orderId).get();
  if (secret.exists) {
    const code = secret.get('code');
    if (typeof code === 'string' && code.length > 0) return code;
  }

  const order = await collection().doc(orderId).get();
  if (!order.exists) return null;

  const legacy = order.get('deliveryCode') ?? order.get('deliveryOTP');
  return typeof legacy === 'string' && legacy.length > 0 ? legacy : null;
}

export async function create(
  document: NewOrderDocument,
  audience: Audience,
): Promise<Order> {
  const ref = collection().doc();

  // The code is split out rather than written onto the order, and the two
  // writes go in one batch so an order can never exist without its code.
  const { deliveryCode, ...orderFields } = document;

  const batch = db.batch();

  batch.set(secrets().doc(ref.id), {
    orderId: ref.id,
    code: deliveryCode,
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(ref, {
    ...orderFields,
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

  await batch.commit();

  const snapshot = await ref.get();
  const order = toOrder(snapshot, audience);

  // The customer needs the code back — it is not on the document any more,
  // and this is the one response where they have not yet had a chance to ask
  // for it.
  if (audience === 'customer' || audience === 'admin') {
    order.deliveryCode = deliveryCode;
  }

  return order;
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
 * Matches CLAIMABLE_STATUSES rather than `ready` alone, so this list and
 * `assignDriver` agree on what is claimable — otherwise a driver would be
 * shown orders they cannot take, or able to take orders they were never
 * shown.
 *
 * The `in` filter combined with the `createdAt` ordering needs the composite
 * index declared in firebase/firestore.indexes.json. The emulator does not
 * enforce indexes, so without that file this query would pass every test and
 * fail only in production.
 */
export async function listAvailableForDrivers(
  options: ListOptions,
): Promise<Page<Order>> {
  return runList(
    (base) =>
      base
        .where('driverId', '==', null)
        .where('status', 'in', [...CLAIMABLE_STATUSES]),
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

    const status = snapshot.get('status') as OrderStatus;
    if (!CLAIMABLE_STATUSES.includes(status)) {
      throw ApiError.conflict('This order is not available to claim.');
    }

    // Food already waiting: claiming it is the collection, so this is one
    // step rather than a claim the driver must immediately confirm.
    const collectingNow = status === 'ready';

    transaction.update(ref, {
      driverId,
      claimedAt: FieldValue.serverTimestamp(),
      ...(collectingNow
        ? { status: 'picked_up', pickedUpAt: FieldValue.serverTimestamp() }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const snapshot = await ref.get();
  return toOrder(snapshot, 'driver');
}

/**
 * Give up a claim, returning the order to the available pool.
 *
 * Only before collection. Once the food is in the driver's hands, releasing
 * it would leave an order nobody is carrying and a customer still waiting —
 * that needs an admin, not a tap.
 */
export async function releaseDriver(
  orderId: string,
  driverId: string,
): Promise<Order> {
  const ref = collection().doc(orderId);

  await db.runTransaction(async (transaction: Transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw ApiError.notFound('No such order.');

    if (snapshot.get('driverId') !== driverId) {
      // Reported as missing so a driver cannot probe other orders.
      throw ApiError.notFound('No such order.');
    }

    const status = snapshot.get('status') as OrderStatus;
    if (status === 'picked_up' || status === 'delivered') {
      throw ApiError.conflict(
        'You already have the food — contact support to hand this over.',
      );
    }

    transaction.update(ref, {
      driverId: null,
      claimedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const snapshot = await ref.get();
  return toOrder(snapshot, 'driver');
}

/**
 * Record that the driver handed the vendor their cash for a cash order.
 *
 * The amount is computed here from the order, never supplied by the driver:
 * it is the vendor's take, and a driver who could name it could under-declare
 * what they owe.
 */
export async function recordCashHandover(
  orderId: string,
  driverId: string,
): Promise<Order> {
  const ref = collection().doc(orderId);

  await db.runTransaction(async (transaction: Transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw ApiError.notFound('No such order.');

    if (snapshot.get('driverId') !== driverId) {
      throw ApiError.notFound('No such order.');
    }
    if (snapshot.get('paymentMethod') !== 'cash') {
      throw ApiError.unprocessable('This is not a cash order.');
    }
    if (snapshot.get('status') !== 'delivered') {
      throw ApiError.conflict('Deliver the order before settling the cash.');
    }
    if (snapshot.get('cashGivenToVendor') === true) {
      throw ApiError.conflict('This cash has already been marked as handed over.');
    }

    // The vendor's full pre-commission take; commission is settled between
    // the vendor and the platform separately.
    const subtotal = Number(snapshot.get('subtotal') ?? 0);

    transaction.update(ref, {
      cashGivenToVendor: true,
      cashGivenToVendorAt: FieldValue.serverTimestamp(),
      cashGivenAmount: subtotal,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const snapshot = await ref.get();
  return toOrder(snapshot, 'driver');
}

/**
 * Vendor's response to a driver's cash handover claim.
 *
 * Confirming and disputing are the same write with a different flag, so they
 * share one transaction and one set of preconditions.
 */
export async function settleCashReceipt(
  orderId: string,
  outcome: 'confirm' | 'dispute',
): Promise<Order> {
  const ref = collection().doc(orderId);

  await db.runTransaction(async (transaction: Transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw ApiError.notFound('No such order.');

    if (snapshot.get('cashGivenToVendor') !== true) {
      throw ApiError.conflict(
        'The driver has not recorded handing this cash over yet.',
      );
    }
    if (
      snapshot.get('vendorCashConfirmed') === true ||
      snapshot.get('vendorCashDisputed') === true
    ) {
      throw ApiError.conflict('This cash receipt has already been settled.');
    }

    transaction.update(ref, {
      ...(outcome === 'confirm'
        ? {
            vendorCashConfirmed: true,
            vendorCashConfirmedAt: FieldValue.serverTimestamp(),
          }
        : {
            vendorCashDisputed: true,
            vendorCashDisputedAt: FieldValue.serverTimestamp(),
          }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const snapshot = await ref.get();
  return toOrder(snapshot, 'vendor');
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
  submittedCode: string | undefined,
): Promise<DeliveryResult> {
  const ref = collection().doc(orderId);
  const secretRef = secrets().doc(orderId);

  const result = await db.runTransaction(
    async (transaction: Transaction): Promise<DeliveryResult> => {
      // Both reads first — Firestore rejects a transaction that reads after
      // it has written.
      const [snapshot, secretSnapshot] = await Promise.all([
        transaction.get(ref),
        transaction.get(secretRef),
      ]);
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

      // The code lives in orderSecrets, which no client can read. Orders
      // written before that still carry it on the document itself, so the
      // fallback keeps historical deliveries closable.
      const expected = secretSnapshot.exists
        ? secretSnapshot.get('code')
        : (snapshot.get('deliveryCode') ?? snapshot.get('deliveryOTP'));

      // Orders placed before delivery codes existed have none stored. The web
      // app skipped verification for those, and refusing them now would strip
      // drivers of any way to close a historical delivery. Only a genuinely
      // codeless order qualifies — a driver cannot remove a code, because
      // drivers cannot write to orders at all.
      if (typeof expected !== 'string' || expected.length === 0) {
        transaction.update(ref, {
          status: 'delivered',
          deliveryVerified: false,
          deliveredAt: FieldValue.serverTimestamp(),
          actualDeliveryTime: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { outcome: 'delivered', order: toOrder(snapshot, 'driver') };
      }

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
        // The existing driver and vendor views read actualDeliveryTime, so it
        // is kept in step rather than leaving them showing a blank time.
        actualDeliveryTime: FieldValue.serverTimestamp(),
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
