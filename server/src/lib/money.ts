/**
 * Platform economics — the server-authoritative money split.
 *
 * This is the backend counterpart of the web app's services/economics.ts, and
 * it is now the only implementation that may decide what anyone gets paid.
 * The web checkout previously computed these numbers in the browser and wrote
 * them straight onto the order document, which meant any client could choose
 * its own payout. Orders created through this API compute the split here and
 * clients never supply the figures at all.
 *
 * Arithmetic runs in integer cents. Working in rands with floating point can
 * produce values like 12.749999999999998, and rounding those at the end still
 * drifts once amounts are summed across thousands of orders.
 *
 * Results are intentionally identical to the previous float implementation for
 * the same inputs, so historical orders reconcile against new ones.
 */

import { env } from '../config/env';
import { ApiError } from './ApiError';

/** Fraction of the food subtotal the platform takes from the vendor. */
export const COMMISSION_RATE = env.COMMISSION_RATE;

/** Fraction of the delivery fee the driver keeps. */
export const DRIVER_DELIVERY_SHARE = env.DRIVER_DELIVERY_SHARE;

/** Largest order we will price, in rands. Guards against overflow nonsense. */
const MAX_ORDER_AMOUNT = 1_000_000;

export type OrderEconomics = {
  /** Cash the vendor receives — subtotal minus commission. */
  vendorPayout: number;
  /** Cash the driver receives — share of the delivery fee. */
  driverPayout: number;
  /** What the platform earns on this order = commission + delivery share. */
  platformEarnings: number;
  /** Commission amount in rands, broken out for accounting visibility. */
  platformCommission: number;
  /** Rate snapshots, frozen so we know how this order was priced. */
  commissionRate: number;
  driverDeliveryShare: number;
};

/** Rands -> integer cents, rejecting anything that is not clean money. */
export function toCents(amount: number, field: string): number {
  if (!Number.isFinite(amount)) {
    throw ApiError.unprocessable(`${field} must be a finite number.`);
  }
  if (amount < 0) {
    throw ApiError.unprocessable(`${field} may not be negative.`);
  }
  if (amount > MAX_ORDER_AMOUNT) {
    throw ApiError.unprocessable(`${field} exceeds the maximum order amount.`);
  }
  const cents = Math.round(amount * 100);
  // Reject sub-cent precision rather than silently rounding a price away.
  if (Math.abs(amount * 100 - cents) > 1e-6) {
    throw ApiError.unprocessable(`${field} may not be finer than one cent.`);
  }
  return cents;
}

/**
 * A wallet balance in rands -> integer cents. Unlike {@link toCents}, which
 * guards prices and amounts, this allows a negative value, because a balance
 * can legitimately be below zero: a driver or kitchen holding cash from cash
 * orders owes the platform its share until card earnings cover it, and the
 * platform wallet goes negative when goodwill paid out exceeds what it has
 * earned. Refusing to read those balances would make the next entry on the
 * wallet fail - including the settlement of an ordinary card order.
 */
export function balanceToCents(amount: number, field: string): number {
  if (!Number.isFinite(amount)) {
    throw ApiError.unprocessable(`${field} must be a finite number.`);
  }
  if (Math.abs(amount) > MAX_ORDER_AMOUNT * 1000) {
    throw ApiError.unprocessable(`${field} is beyond any plausible balance.`);
  }
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 1e-6) {
    throw ApiError.unprocessable(`${field} may not be finer than one cent.`);
  }
  return cents;
}

/** Integer cents -> rands with exactly two decimals of precision. */
export function toRands(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Compute the money split for an order.
 *
 * @param subtotal    Food total in rands, before delivery.
 * @param deliveryFee Delivery fee in rands.
 */
export function computeOrderEconomics(
  subtotal: number,
  deliveryFee: number,
): OrderEconomics {
  const subtotalCents = toCents(subtotal, 'subtotal');
  const deliveryFeeCents = toCents(deliveryFee, 'deliveryFee');

  const commissionCents = Math.round(subtotalCents * COMMISSION_RATE);
  const vendorPayoutCents = subtotalCents - commissionCents;

  const driverPayoutCents = Math.round(deliveryFeeCents * DRIVER_DELIVERY_SHARE);
  const platformDeliveryCents = deliveryFeeCents - driverPayoutCents;

  const platformEarningsCents = commissionCents + platformDeliveryCents;

  return {
    vendorPayout: toRands(vendorPayoutCents),
    driverPayout: toRands(driverPayoutCents),
    platformEarnings: toRands(platformEarningsCents),
    platformCommission: toRands(commissionCents),
    commissionRate: COMMISSION_RATE,
    driverDeliveryShare: DRIVER_DELIVERY_SHARE,
  };
}

/**
 * Every cent a customer pays must land in exactly one of the three buckets.
 * Called on each order write; a failure here means a pricing bug, not bad
 * input, so it surfaces as a 500 rather than a client error.
 */
export function assertSplitBalances(
  subtotal: number,
  deliveryFee: number,
  economics: OrderEconomics,
): void {
  const paid = toCents(subtotal, 'subtotal') + toCents(deliveryFee, 'deliveryFee');
  const distributed =
    toCents(economics.vendorPayout, 'vendorPayout') +
    toCents(economics.driverPayout, 'driverPayout') +
    toCents(economics.platformEarnings, 'platformEarnings');

  if (paid !== distributed) {
    throw ApiError.internal(
      `Order split does not balance: customer pays ${paid}c but ` +
        `${distributed}c was distributed.`,
    );
  }
}

/** Sum a list of rand amounts without accumulating floating-point drift. */
export function sumRands(amounts: readonly number[]): number {
  return toRands(
    amounts.reduce((total, amount) => total + toCents(amount, 'amount'), 0),
  );
}
