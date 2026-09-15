/**
 * The cancellation tiers, as a table.
 *
 * Every figure uses one order: R100 of food and a R20 delivery fee, which the
 * default economics split into R92 for the vendor, R17 for the driver and R11
 * for the platform. The base arrival fee is half the driver's pay: R8.50.
 *
 * Two properties are checked across every case rather than trusted per rule:
 * no one is paid out of thin air (everything distributed equals what the
 * customer paid, plus any goodwill the platform explicitly covers), and no
 * refund is ever negative.
 */

import { describe, expect, it } from 'vitest';
import {
  automaticRefundAllowed,
  planCancellation,
  planGoodwillTopUp,
  stageFor,
  type CancellationInput,
  type CancellationPlan,
} from './cancellation.policy';
import { ORDER_STATUSES, type OrderStatus } from './order.model';

const ORDER = {
  total: 120,
  vendorPayout: 92,
  driverPayout: 17,
  platformEarnings: 11,
  arrivalFeeShare: 0.5,
};

function decide(overrides: Partial<CancellationInput>) {
  return planCancellation({
    status: 'pending',
    initiator: 'customer',
    paymentMethod: 'yoco',
    paymentStatus: 'paid',
    driverAssigned: false,
    ...ORDER,
    ...overrides,
  });
}

function plan(overrides: Partial<CancellationInput>): CancellationPlan {
  const decision = decide(overrides);
  if (!decision.allowed) throw new Error(`expected allowed, got: ${decision.reason}`);
  return decision.plan;
}

/** Everyone's share adds up to what was paid, plus what the platform covers. */
function expectBalanced(p: CancellationPlan) {
  const paid = p.prepaid ? ORDER.total : 0;
  const distributed = p.customerRefund + p.vendorPay + p.driverPay + p.platformKeeps;
  expect(Math.round(distributed * 100)).toBe(Math.round((paid + p.goodwill) * 100));
  expect(p.customerRefund).toBeGreaterThanOrEqual(0);
}

describe('stages', () => {
  it('groups statuses into the three tiers', () => {
    expect(stageFor('pending')).toBe('before_prep');
    expect(stageFor('confirmed')).toBe('before_prep');
    expect(stageFor('preparing')).toBe('in_kitchen');
    expect(stageFor('ready')).toBe('in_kitchen');
    expect(stageFor('picked_up')).toBe('on_the_way');
    expect(stageFor('delivered')).toBeNull();
    expect(stageFor('cancelled')).toBeNull();
  });

  it('allows an automatic refund only before the kitchen starts', () => {
    const allowed = ORDER_STATUSES.filter((status) => automaticRefundAllowed(status));
    expect(allowed).toEqual(['pending', 'confirmed']);
  });
});

describe('tier 1: pending or accepted, before prep', () => {
  for (const status of ['pending', 'confirmed'] as OrderStatus[]) {
    it(`refunds the customer in full and pays nobody (${status})`, () => {
      const p = plan({ status });

      expect(p.customerRefund).toBe(120);
      expect(p.vendorPay).toBe(0);
      expect(p.vendorSettlement).toBe('reverse');
      expect(p.driverPay).toBe(0);
      expect(p.platformKeeps).toBe(0);
      expect(p.goodwill).toBe(0);
      expectBalanced(p);
    });
  }

  it('pays a driver nothing even if they had already claimed an accepted order', () => {
    const p = plan({ status: 'confirmed', driverAssigned: true });

    expect(p.driverPay).toBe(0);
    expect(p.customerRefund).toBe(120);
  });

  it('cancels an unpaid order without moving any money', () => {
    const p = plan({ status: 'pending', paymentMethod: 'cash', paymentStatus: 'pending' });

    expect(p).toMatchObject({ customerRefund: 0, vendorPay: 0, driverPay: 0, goodwill: 0 });
    expectBalanced(p);
  });
});

describe('tier 2: in preparation or ready for pickup', () => {
  for (const status of ['preparing', 'ready'] as OrderStatus[]) {
    it(`pays the vendor for the food and refunds the rest (${status})`, () => {
      const p = plan({ status });

      expect(p.vendorPay).toBe(92);
      expect(p.vendorSettlement).toBe('release');
      expect(p.driverPay).toBe(0);
      // R120 paid, R92 kept by the vendor for food already made.
      expect(p.customerRefund).toBe(28);
      expect(p.platformKeeps).toBe(0);
      expectBalanced(p);
    });
  }

  it('pays a dispatched driver the base arrival fee, out of the refund', () => {
    const p = plan({ status: 'preparing', driverAssigned: true });

    expect(p.driverPay).toBe(8.5);
    expect(p.vendorPay).toBe(92);
    expect(p.customerRefund).toBe(19.5);
    expect(p.goodwill).toBe(0);
    expectBalanced(p);
  });

  it('rounds the arrival fee to the cent', () => {
    const p = plan({ status: 'preparing', driverAssigned: true, driverPayout: 17.05 });

    expect(p.driverPay).toBe(8.53);
  });

  it('will not let a customer cancel an unpaid order once food is being made', () => {
    // There is nothing captured to take the food cost from.
    const decision = decide({ status: 'preparing', paymentMethod: 'cash', paymentStatus: 'pending' });

    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.code).toBe('needs_admin');
  });
});

describe('tier 3: picked up or on the way', () => {
  it('refunds nothing and pays vendor and driver in full', () => {
    const p = plan({ status: 'picked_up', driverAssigned: true });

    expect(p.customerRefund).toBe(0);
    expect(p.vendorPay).toBe(92);
    expect(p.driverPay).toBe(17);
    expect(p.platformKeeps).toBe(11);
    expect(p.goodwill).toBe(0);
    expectBalanced(p);
  });

  it('will not let a customer cancel an unpaid order the driver is carrying', () => {
    const decision = decide({
      status: 'picked_up',
      driverAssigned: true,
      paymentMethod: 'cash',
      paymentStatus: 'pending',
    });

    expect(decision.allowed === false && decision.code).toBe('needs_admin');
  });
});

describe('vendor cancellations', () => {
  it('refunds the customer in full and pays the vendor nothing, even mid-prep', () => {
    const p = plan({ status: 'preparing', initiator: 'vendor' });

    expect(p.customerRefund).toBe(120);
    expect(p.vendorPay).toBe(0);
    expect(p.vendorSettlement).toBe('reverse');
    expectBalanced(p);
  });

  it('still pays a dispatched driver, as a platform-covered expense', () => {
    const p = plan({ status: 'ready', initiator: 'vendor', driverAssigned: true });

    expect(p.driverPay).toBe(8.5);
    expect(p.goodwill).toBe(8.5);
    expect(p.customerRefund).toBe(120);
    expectBalanced(p);
  });

  it('cannot cancel once the food has left the kitchen', () => {
    const decision = decide({ status: 'picked_up', initiator: 'vendor', driverAssigned: true });

    expect(decision.allowed === false && decision.code).toBe('not_permitted');
  });
});

describe('admin cancellations', () => {
  it('follow the same tiers as a customer for a paid order', () => {
    for (const status of ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'] as OrderStatus[]) {
      for (const driverAssigned of [false, true]) {
        expect(plan({ status, driverAssigned, initiator: 'admin' })).toEqual({
          ...plan({ status, driverAssigned, initiator: 'customer' }),
          initiator: 'admin',
        });
      }
    }
  });

  it('pay the vendor and driver for an unpaid order as goodwill', () => {
    const inKitchen = plan({
      status: 'preparing',
      initiator: 'admin',
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      driverAssigned: true,
    });

    expect(inKitchen).toMatchObject({
      customerRefund: 0,
      vendorPay: 92,
      vendorSettlement: 'credit',
      driverPay: 8.5,
      goodwill: 100.5,
    });
    expectBalanced(inKitchen);

    const onTheWay = plan({
      status: 'picked_up',
      initiator: 'admin',
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      driverAssigned: true,
    });

    expect(onTheWay).toMatchObject({ vendorPay: 92, driverPay: 17, goodwill: 109 });
    expectBalanced(onTheWay);
  });
});

describe('finished orders', () => {
  it('cannot be cancelled by anyone', () => {
    for (const status of ['delivered', 'cancelled'] as OrderStatus[]) {
      for (const initiator of ['customer', 'vendor', 'admin'] as const) {
        const decision = decide({ status, initiator });
        expect(decision.allowed === false && decision.code).toBe('terminal');
      }
    }
  });
});

describe('balance across every combination', () => {
  it('never creates or loses money and never refunds a negative amount', () => {
    const statuses: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'];
    const payments = [
      { paymentMethod: 'yoco', paymentStatus: 'paid' },
      { paymentMethod: 'cash', paymentStatus: 'pending' },
      { paymentMethod: 'ozow', paymentStatus: 'pending' },
    ];

    let checked = 0;
    for (const status of statuses) {
      for (const initiator of ['customer', 'vendor', 'admin'] as const) {
        for (const payment of payments) {
          for (const driverAssigned of [false, true]) {
            const decision = decide({ status, initiator, driverAssigned, ...payment });
            if (!decision.allowed) continue;
            expectBalanced(decision.plan);
            checked += 1;
          }
        }
      }
    }

    expect(checked).toBeGreaterThan(40);
  });
});

describe('goodwill top-up', () => {
  it('tops a customer up to what they paid, never beyond', () => {
    expect(planGoodwillTopUp(120, 28)).toBe(92);
    expect(planGoodwillTopUp(120, 0)).toBe(120);
    expect(planGoodwillTopUp(120, 120)).toBe(0);
    expect(planGoodwillTopUp(120, 150)).toBe(0);
  });
});
