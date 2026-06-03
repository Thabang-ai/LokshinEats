// Platform economics — single source of truth for how money splits on
// every order. Frozen onto each order doc at checkout time, so changing
// these rates later doesn't retroactively alter historical orders.
//
// Defaults are the "launch phase" recommendation: low commission to attract
// vendors, fair driver share. Revisit once you have product-market fit
// data — incumbents in SA charge 15-30% from vendors but they have brand.

/** Fraction of food subtotal the platform takes from the vendor. */
export const COMMISSION_RATE = 0.08; // 8%

/** Fraction of the delivery fee the driver keeps. */
export const DRIVER_DELIVERY_SHARE = 0.85; // 85% to driver, 15% to platform

export type OrderEconomics = {
  /** Cash the vendor receives — subtotal minus commission. */
  vendorPayout: number;
  /** Cash the driver receives — share of delivery fee. */
  driverPayout: number;
  /** What platform earns from this order = commission + delivery share. */
  platformEarnings: number;
  /** Commission amount in rands (for accounting visibility). */
  platformCommission: number;
  /** Rate snapshot — frozen so we know the rate this order was priced at. */
  commissionRate: number;
  driverDeliveryShare: number;
};

/**
 * Compute the money split for an order.
 *
 * Numbers are rounded to 2 decimals so we never store floating-point
 * artifacts like R12.749999 in Firestore.
 */
export function computeOrderEconomics(
  subtotal: number,
  deliveryFee: number,
): OrderEconomics {
  const round = (n: number) => Math.round(n * 100) / 100;

  const platformCommission = round(subtotal * COMMISSION_RATE);
  const vendorPayout = round(subtotal - platformCommission);
  const driverPayout = round(deliveryFee * DRIVER_DELIVERY_SHARE);
  const platformDeliveryShare = round(deliveryFee - driverPayout);
  const platformEarnings = round(platformCommission + platformDeliveryShare);

  return {
    vendorPayout,
    driverPayout,
    platformEarnings,
    platformCommission,
    commissionRate: COMMISSION_RATE,
    driverDeliveryShare: DRIVER_DELIVERY_SHARE,
  };
}

/**
 * Backward-compatible driver payout extraction.
 * Orders created before the economics fields exist fall back to a
 * retroactive split at the current rate.
 */
export function readDriverPayout(orderData: {
  driverPayout?: number;
  deliveryFee?: number;
}): number {
  if (typeof orderData.driverPayout === 'number') return orderData.driverPayout;
  const fee = typeof orderData.deliveryFee === 'number' ? orderData.deliveryFee : 0;
  return Math.round(fee * DRIVER_DELIVERY_SHARE * 100) / 100;
}

/**
 * Backward-compatible vendor payout extraction.
 * Pre-economics orders fall back to subtotal × (1 − commission rate).
 */
export function readVendorPayout(orderData: {
  vendorPayout?: number;
  subtotal?: number;
  total?: number;
  deliveryFee?: number;
}): number {
  if (typeof orderData.vendorPayout === 'number') return orderData.vendorPayout;
  // Pre-economics orders may not have subtotal explicit; derive from total.
  const subtotal =
    typeof orderData.subtotal === 'number'
      ? orderData.subtotal
      : Math.max(
          0,
          (typeof orderData.total === 'number' ? orderData.total : 0) -
            (typeof orderData.deliveryFee === 'number' ? orderData.deliveryFee : 0),
        );
  return Math.round(subtotal * (1 - COMMISSION_RATE) * 100) / 100;
}
