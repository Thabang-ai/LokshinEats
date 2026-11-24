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
  DELIVERY_FEE,
  DRIVER_DELIVERY_COMMISSION,
} from './money';

/**
 * The original float implementation from services/economics.ts, for the half
 * of the split that has not changed.
 *
 * The delivery half has: it used to pay the driver a share of the fee and now
 * pays them the fee less a fixed cut, so there is nothing left to compare
 * there. The vendor's commission is untouched and still has to reconcile
 * against every order ever priced.
 */
function legacyVendorHalf(subtotal: number) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const platformCommission = round(subtotal * COMMISSION_RATE);
  return { platformCommission, vendorPayout: round(subtotal - platformCommission) };
}

describe('computeOrderEconomics', () => {
  it('splits a typical order the way the rules describe', () => {
    // R100 of food, the standard R12 delivery: 8% of the food to the
    // platform, R2 of the fee to the platform, R10 of it to the driver.
    const result = computeOrderEconomics(100, DELIVERY_FEE);

    expect(result.platformCommission).toBe(8);
    expect(result.vendorPayout).toBe(92);
    expect(result.driverPayout).toBe(10);
    expect(result.platformEarnings).toBe(10);
  });

  it('gives the driver every rand a larger fee adds', () => {
    // The platform's cut is the fixed part. A share would have quietly
    // raised the platform's take with the fee instead.
    const result = computeOrderEconomics(100, 20);

    expect(result.driverPayout).toBe(18);
    expect(result.platformEarnings).toBe(10);
  });

  it('never pays a driver a negative amount', () => {
    // A fee below the platform's cut would otherwise do exactly that.
    const result = computeOrderEconomics(100, 1);

    expect(result.driverPayout).toBe(0);
    expect(result.platformEarnings).toBe(9);
    expect(() => assertSplitBalances(100, 1, result)).not.toThrow();
  });

  it('freezes the rates onto the result', () => {
    const result = computeOrderEconomics(50, 15);
    expect(result.commissionRate).toBe(COMMISSION_RATE);
    expect(result.driverDeliveryCommission).toBe(DRIVER_DELIVERY_COMMISSION);
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

  it("still pays the vendor what every order before it was paid", () => {
    // The commission did not change, so historical orders must reconcile
    // against new ones rather than drift by a cent.
    for (const [subtotal, deliveryFee] of [
      [12.75, 19.99],
      [149.5, 25],
      [0.99, 0],
      [1000, 45.55],
      [37.37, 12.5],
    ] as const) {
      const actual = computeOrderEconomics(subtotal, deliveryFee);
      const legacy = legacyVendorHalf(subtotal);

      expect(actual.vendorPayout).toBe(legacy.vendorPayout);
      expect(actual.platformCommission).toBe(legacy.platformCommission);
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
