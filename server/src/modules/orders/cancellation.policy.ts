/**
 * Cancellation policy: who gets what when an order is cancelled.
 *
 * Pure — no Firestore, no clock, no configuration read — so the whole rule
 * set can be tested as a table, and the service that moves money only carries
 * out a plan it did not design.
 *
 * The rules are staged by how much work and food has been committed:
 *
 *   before_prep  (pending, confirmed)
 *     Nothing committed. A customer is refunded in full; vendor and driver
 *     receive nothing.
 *
 *   in_kitchen   (preparing, ready)
 *     Food is being made. A customer who cancels pays for it: the vendor is
 *     paid their full share so the stock is not a loss, a driver who had
 *     already been dispatched receives a base arrival fee, and the customer
 *     is refunded what is left.
 *
 *   on_the_way   (picked_up)
 *     Food and a driver's time and fuel are spent. No refund; the vendor and
 *     the driver are paid in full, as if it had been delivered.
 *
 * Anything more generous than these outcomes is not something the policy
 * produces. It is a goodwill decision an admin makes explicitly, and it is
 * paid for by the platform rather than taken back from a vendor or driver —
 * see `planGoodwillTopUp`.
 *
 * Every amount is worked in integer cents and returned in rands.
 */

import type { OrderStatus } from './order.model';

export const CANCELLATION_STAGES = ['before_prep', 'in_kitchen', 'on_the_way'] as const;
export type CancellationStage = (typeof CANCELLATION_STAGES)[number];

export type CancellationInitiator = 'customer' | 'vendor' | 'admin';

/**
 * What happens to the vendor's share.
 *
 *  - `reverse` — take back the pending credit written when the order was paid.
 *  - `release` — keep it, and move it from pending to available now, because
 *    no delivery is coming to release it.
 *  - `credit`  — pay it fresh. Only for an order that was never paid for, so
 *    there is no pending credit to release; the platform funds it.
 *  - `none`    — nothing was credited and nothing is owed.
 */
export type VendorSettlement = 'none' | 'reverse' | 'release' | 'credit';

export type CancellationInput = {
  status: OrderStatus;
  initiator: CancellationInitiator;
  paymentMethod: string;
  paymentStatus: string;
  /** Whether a driver had claimed the order. */
  driverAssigned: boolean;
  total: number;
  vendorPayout: number;
  driverPayout: number;
  platformEarnings: number;
  /** Share of the driver's delivery pay given as a base arrival fee. */
  arrivalFeeShare: number;
};

export type CancellationPlan = {
  stage: CancellationStage;
  initiator: CancellationInitiator;
  fromStatus: OrderStatus;
  /** Money was captured up front, so there is something to refund from. */
  prepaid: boolean;
  /** Returned to the customer's wallet. */
  customerRefund: number;
  /** What the vendor ends up with for this order. */
  vendorPay: number;
  vendorSettlement: VendorSettlement;
  /** What the driver is paid for this order. */
  driverPay: number;
  /** How much of the platform's earnings it keeps. */
  platformKeeps: number;
  /** How much of the platform's earnings is reversed. */
  platformReversal: number;
  /** Paid by the platform beyond anything the customer paid. */
  goodwill: number;
};

export type CancellationDecision =
  | { allowed: true; plan: CancellationPlan }
  | {
      allowed: false;
      code: 'terminal' | 'not_permitted' | 'needs_admin';
      reason: string;
    };

const cents = (rands: number): number => Math.round(rands * 100);
const rands = (value: number): number => value / 100;

/** Which stage an order is at, or null once it is delivered or cancelled. */
export function stageFor(status: OrderStatus): CancellationStage | null {
  switch (status) {
    case 'pending':
    case 'confirmed':
      return 'before_prep';
    case 'preparing':
    case 'ready':
      return 'in_kitchen';
    case 'picked_up':
      return 'on_the_way';
    default:
      return null;
  }
}

/**
 * Whether money was captured for this order before it was delivered.
 *
 * A cash order is only paid at the door, so before delivery it is never
 * prepaid — which is exactly why it cannot carry a cancellation fee.
 */
export function isPrepaid(paymentMethod: string, paymentStatus: string): boolean {
  return paymentMethod !== 'cash' && paymentStatus === 'paid';
}

/**
 * Whether a refund may be issued without an admin approving it as goodwill.
 *
 * Only before the kitchen starts. From then on, a full refund would come out
 * of a vendor's food cost or a driver's pay, so it has to be a deliberate,
 * platform-funded decision.
 */
export function automaticRefundAllowed(status: OrderStatus): boolean {
  return stageFor(status) === 'before_prep';
}

/** Work out who gets what if this order is cancelled now, by this party. */
export function planCancellation(input: CancellationInput): CancellationDecision {
  const stage = stageFor(input.status);
  if (!stage) {
    return {
      allowed: false,
      code: 'terminal',
      reason: `An order that is ${input.status.replace('_', ' ')} cannot be cancelled.`,
    };
  }

  const prepaid = isPrepaid(input.paymentMethod, input.paymentStatus);

  const totalCents = cents(input.total);
  const vendorCents = cents(input.vendorPayout);
  const driverCents = cents(input.driverPayout);
  const platformCents = cents(input.platformEarnings);
  const arrivalFeeCents = Math.round(driverCents * input.arrivalFeeShare);

  const base = { stage, initiator: input.initiator, fromStatus: input.status, prepaid };

  const plan = (p: {
    customerRefund?: number;
    vendorPay?: number;
    vendorSettlement?: VendorSettlement;
    driverPay?: number;
    platformKeeps?: number;
    platformReversal?: number;
    goodwill?: number;
  }): CancellationDecision => ({
    allowed: true,
    plan: {
      ...base,
      customerRefund: rands(p.customerRefund ?? 0),
      vendorPay: rands(p.vendorPay ?? 0),
      vendorSettlement: p.vendorSettlement ?? 'none',
      driverPay: rands(p.driverPay ?? 0),
      platformKeeps: rands(p.platformKeeps ?? 0),
      platformReversal: rands(p.platformReversal ?? 0),
      goodwill: rands(p.goodwill ?? 0),
    },
  });

  // --- The vendor cannot fulfil the order --------------------------------
  //
  // Not the customer's doing, so they are refunded in full and the vendor
  // forfeits their share. A driver already dispatched is not at fault either:
  // they get the arrival fee, which the platform covers.
  if (input.initiator === 'vendor') {
    if (stage === 'on_the_way') {
      return {
        allowed: false,
        code: 'not_permitted',
        reason: 'The food has already left the kitchen. Contact LokshinEats support to cancel it.',
      };
    }

    const driverPay = stage === 'in_kitchen' && input.driverAssigned ? arrivalFeeCents : 0;

    return prepaid
      ? plan({
          customerRefund: totalCents,
          vendorSettlement: 'reverse',
          platformReversal: platformCents,
          driverPay,
          goodwill: driverPay,
        })
      : plan({ driverPay, goodwill: driverPay });
  }

  // --- Before prep: nothing committed ------------------------------------
  if (stage === 'before_prep') {
    return prepaid
      ? plan({
          customerRefund: totalCents,
          vendorSettlement: 'reverse',
          platformReversal: platformCents,
        })
      : plan({});
  }

  // --- In the kitchen or on the way, never paid for ----------------------
  //
  // There is no captured money to take a cancellation fee from. A customer
  // cannot cancel through the app here — they would walk away owing for food
  // already made. An admin can, and the platform pays what the vendor and
  // driver are owed.
  if (!prepaid) {
    if (input.initiator === 'customer') {
      return {
        allowed: false,
        code: 'needs_admin',
        reason:
          'Your food is already being prepared and this order was not paid in advance, ' +
          'so it can only be cancelled by LokshinEats support.',
      };
    }

    const driverPay =
      stage === 'on_the_way' ? driverCents : input.driverAssigned ? arrivalFeeCents : 0;

    return plan({
      vendorPay: vendorCents,
      vendorSettlement: 'credit',
      driverPay,
      goodwill: vendorCents + driverPay,
    });
  }

  // --- In the kitchen, paid ----------------------------------------------
  //
  // The customer pays for the food and for a dispatched driver's trip, and is
  // refunded the rest. The platform takes nothing on a cancelled order, which
  // is where the refund comes from.
  if (stage === 'in_kitchen') {
    const driverPay = input.driverAssigned ? arrivalFeeCents : 0;

    return plan({
      customerRefund: totalCents - vendorCents - driverPay,
      vendorPay: vendorCents,
      vendorSettlement: 'release',
      driverPay,
      platformReversal: platformCents,
    });
  }

  // --- On the way, paid --------------------------------------------------
  //
  // Settled exactly as a delivery would be, with no refund.
  return plan({
    vendorPay: vendorCents,
    vendorSettlement: 'release',
    driverPay: driverCents,
    platformKeeps: platformCents,
  });
}

/**
 * How much a goodwill refund adds on top of what the customer already got back.
 *
 * Tops the customer up to everything they paid, never beyond it. The whole
 * amount is a platform expense: the vendor and driver keep what the policy
 * paid them.
 */
export function planGoodwillTopUp(amountPaid: number, alreadyRefunded: number): number {
  return rands(Math.max(0, cents(amountPaid) - cents(alreadyRefunded)));
}
