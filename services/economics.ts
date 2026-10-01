// Platform economics — READ helpers only.
//
// The split itself is computed by the API (server/src/lib/money.ts) and frozen
// onto the order at creation. It used to be computed here, in the browser, and
// written straight onto the order document — which is how a client could hand
// itself the platform's commission. `computeOrderEconomics` was removed from
// this file rather than left unused, so it cannot be wired back into a write.
//
// What remains reads payouts back off an existing order, with a fallback for
// orders written before the economics fields existed.
//
// Defaults are the "launch phase" recommendation: low commission to attract
// vendors, fair driver share. Revisit once you have product-market fit
// data — incumbents in SA charge 15-30% from vendors but they have brand.

/** Fraction of food subtotal the platform takes from the vendor. */
export const COMMISSION_RATE = 0.08; // 8%

/** Fraction of the delivery fee the driver keeps. */
export const DRIVER_DELIVERY_SHARE = 0.85; // 85% to driver, 15% to platform

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
