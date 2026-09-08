/**
 * Money split tests.
 *
 * These guard the one calculation that decides what real people are paid, so
 * they check three things: that the split always balances to the cent, that
 * results still match the browser implementation they replaced, and that bad
 * input is rejected rather than quietly rounded.
 */

import { describe, expect, it } from 'vitest';
import {
  assertSplitBalances,
  computeOrderEconomics,
  sumRands,
  toCents,
  COMMISSION_RATE,
  DRIVER_DELIVERY_SHARE,
} from './money';

/** The original float implementation from services/economics.ts. */
function legacyEconomics(subtotal: number, deliveryFee: number) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const platformCommission = round(subtotal * COMMISSION_RATE);
  const vendorPayout = round(subtotal - platformCommission);
  const driverPayout = round(deliveryFee * DRIVER_DELIVERY_SHARE);
  const platformDeliveryShare = round(deliveryFee - driverPayout);
  return {
    vendorPayout,
    driverPayout,
    platformCommission,
    platformEarnings: round(platformCommission + platformDeliveryShare),
  };
}

describe('computeOrderEconomics', () => {
  it('splits a typical order the way the rates describe', () => {
    const result = computeOrderEconomics(100, 20);

    expect(result.platformCommission).toBe(8);
    expect(result.vendorPayout).toBe(92);
    expect(result.driverPayout).toBe(17);
    // 8 commission + 3 kept from the delivery fee.
    expect(result.platformEarnings).toBe(11);
  });

  it('freezes the rates onto the result', () => {
    const result = computeOrderEconomics(50, 15);
    expect(result.commissionRate).toBe(COMMISSION_RATE);
    expect(result.driverDeliveryShare).toBe(DRIVER_DELIVERY_SHARE);
  });

  it('handles a zero-value order without producing NaN', () => {
    const result = computeOrderEconomics(0, 0);
    expect(result).toMatchObject({
      vendorPayout: 0,
      driverPayout: 0,
      platformEarnings: 0,
      platformCommission: 0,
    });
  });

  it('balances to the cent across a wide range of orders', () => {
    for (let subtotal = 0; subtotal <= 500; subtotal += 0.37) {
      for (const deliveryFee of [0, 12.5, 19.99, 25]) {
        const rounded = Math.round(subtotal * 100) / 100;
        const economics = computeOrderEconomics(rounded, deliveryFee);

        // Never throws when the split is correct.
        expect(() =>
          assertSplitBalances(rounded, deliveryFee, economics),
        ).not.toThrow();
      }
    }
  });

  it('matches the browser implementation it replaced', () => {
    // Historical orders were priced by the float version; new orders must
    // reconcile against them rather than drift by a cent.
    for (const [subtotal, deliveryFee] of [
      [12.75, 19.99],
      [149.5, 25],
      [0.99, 0],
      [1000, 45.55],
      [37.37, 12.5],
    ] as const) {
      const actual = computeOrderEconomics(subtotal, deliveryFee);
      const legacy = legacyEconomics(subtotal, deliveryFee);

      expect(actual.vendorPayout).toBe(legacy.vendorPayout);
      expect(actual.driverPayout).toBe(legacy.driverPayout);
      expect(actual.platformCommission).toBe(legacy.platformCommission);
      expect(actual.platformEarnings).toBe(legacy.platformEarnings);
    }
  });

  it('rejects money that is not clean money', () => {
    expect(() => computeOrderEconomics(-1, 0)).toThrow(/negative/i);
    expect(() => computeOrderEconomics(Number.NaN, 0)).toThrow(/finite/i);
    expect(() => computeOrderEconomics(10.001, 0)).toThrow(/one cent/i);
    expect(() => computeOrderEconomics(2_000_000, 0)).toThrow(/maximum/i);
  });
});

describe('toCents', () => {
  it('avoids the float artefacts that motivated integer maths', () => {
    // 0.1 + 0.2 style drift: 12.75 * 100 is not exactly 1275 in binary float.
    expect(toCents(12.75, 'subtotal')).toBe(1275);
    expect(toCents(0.07, 'subtotal')).toBe(7);

    // 1.005 * 100 is 100.49999999999999 in binary float, so this is a genuine
    // half-cent that cannot be represented. Rejecting it is correct: silently
    // rounding would move money without anyone choosing to.
    expect(() => toCents(1.005, 'subtotal')).toThrow(/one cent/i);
  });
});

describe('sumRands', () => {
  it('sums without accumulating drift', () => {
    const amounts = Array.from({ length: 1000 }, () => 0.07);
    expect(sumRands(amounts)).toBe(70);
  });
});
