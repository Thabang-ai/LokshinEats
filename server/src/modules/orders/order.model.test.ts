/**
 * Order model tests.
 *
 * Three things are worth guarding here, and all three are places where the
 * browser used to be trusted:
 *
 *   - The lifecycle. A driver must not be able to declare an order delivered.
 *   - The create schema. A client must not be able to name its own price.
 *   - The serialiser. A driver must never receive the delivery code.
 */

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  canTransition,
  createOrderSchema,
  toOrder,
  type OrderStatus,
} from './order.model';
import { ROLES } from '../../middleware/auth';

const validOrder = {
  storeId: 'store-1',
  items: [{ productId: 'p1', quantity: 2 }],
  deliveryAddress: {
    street: '12 Vilakazi Street',
    city: 'Soweto',
    postalCode: '1804',
  },
  paymentMethod: 'cash' as const,
  customerPhone: '0821234567',
};

describe('order lifecycle', () => {
  it('lets a vendor walk an order to ready', () => {
    // The dashboard's "Accept Order" goes pending -> preparing directly; the
    // confirmed step exists for orders already in that state.
    expect(canTransition('pending', 'preparing', 'vendor')).toBe(true);
    expect(canTransition('pending', 'confirmed', 'vendor')).toBe(true);
    expect(canTransition('confirmed', 'preparing', 'vendor')).toBe(true);
    expect(canTransition('preparing', 'ready', 'vendor')).toBe(true);
  });

  it('lets a driver collect a ready order', () => {
    expect(canTransition('ready', 'picked_up', 'driver')).toBe(true);
  });

  it('never lets anyone reach delivered through a status change', () => {
    // Delivery is only reachable through the delivery-code endpoint. If this
    // ever becomes true, a driver can close an order without the customer.
    for (const from of ORDER_STATUSES) {
      for (const role of ROLES) {
        expect(canTransition(from, 'delivered', role)).toBe(false);
      }
    }
  });

  it('does not let a customer confirm or prepare their own order', () => {
    expect(canTransition('pending', 'confirmed', 'customer')).toBe(false);
    expect(canTransition('pending', 'preparing', 'customer')).toBe(false);
    expect(canTransition('confirmed', 'preparing', 'customer')).toBe(false);
    expect(canTransition('preparing', 'ready', 'customer')).toBe(false);
  });

  it('lets a customer ask to cancel at any stage before delivery', () => {
    // Asking is not the same as getting a refund. What a cancellation costs
    // at each stage — and whether an unpaid order can be cancelled at all —
    // is the cancellation policy's decision: see cancellation.policy.test.ts.
    for (const from of ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'] as OrderStatus[]) {
      expect(canTransition(from, 'cancelled', 'customer')).toBe(true);
    }
  });

  it('lets a vendor cancel only until the food leaves the kitchen', () => {
    for (const from of ['pending', 'confirmed', 'preparing', 'ready'] as OrderStatus[]) {
      expect(canTransition(from, 'cancelled', 'vendor')).toBe(true);
    }
    expect(canTransition('picked_up', 'cancelled', 'vendor')).toBe(false);
  });

  it('never lets a driver cancel', () => {
    // A driver gives an order back with release, before collecting it.
    for (const from of ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'] as OrderStatus[]) {
      expect(canTransition(from, 'cancelled', 'driver')).toBe(false);
    }
    expect(canTransition('picked_up', 'cancelled', 'admin')).toBe(true);
  });

  it('does not let a driver skip ahead of the kitchen', () => {
    expect(canTransition('pending', 'picked_up', 'driver')).toBe(false);
    expect(canTransition('confirmed', 'picked_up', 'driver')).toBe(false);
    expect(canTransition('preparing', 'picked_up', 'driver')).toBe(false);
  });

  it('treats delivered and cancelled as terminal', () => {
    for (const to of ORDER_STATUSES) {
      for (const role of ROLES) {
        expect(canTransition('delivered', to, role)).toBe(false);
        expect(canTransition('cancelled', to, role)).toBe(false);
      }
    }
  });

  it('never allows a transition to itself', () => {
    for (const status of ORDER_STATUSES) {
      for (const role of ROLES) {
        expect(canTransition(status, status, role)).toBe(false);
      }
    }
  });

  it('only names roles that actually exist', () => {
    for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
      for (const roles of Object.values(targets ?? {})) {
        for (const role of roles ?? []) {
          expect(ROLES).toContain(role);
        }
      }
    }
  });
});

describe('createOrderSchema', () => {
  it('accepts a basket of product ids and quantities', () => {
    const parsed = createOrderSchema.parse(validOrder);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.quantity).toBe(2);
  });

  it('refuses to let a client name its own prices', () => {
    // These are the exact fields the old browser checkout wrote onto the
    // order document. Every one of them must now be a validation error.
    for (const field of [
      'subtotal',
      'total',
      'deliveryFee',
      'vendorPayout',
      'driverPayout',
      'platformEarnings',
      'platformCommission',
      'commissionRate',
      'driverDeliveryShare',
    ]) {
      expect(() =>
        createOrderSchema.parse({ ...validOrder, [field]: 1 }),
      ).toThrow();
    }
  });

  it('refuses to let a client declare its order paid', () => {
    expect(() =>
      createOrderSchema.parse({ ...validOrder, paymentStatus: 'paid' }),
    ).toThrow();
    expect(() =>
      createOrderSchema.parse({ ...validOrder, status: 'delivered' }),
    ).toThrow();
  });

  it('refuses to let a client choose its own delivery code', () => {
    expect(() =>
      createOrderSchema.parse({ ...validOrder, deliveryCode: '000000' }),
    ).toThrow();
  });

  it('refuses a per-item price', () => {
    expect(() =>
      createOrderSchema.parse({
        ...validOrder,
        items: [{ productId: 'p1', quantity: 1, price: 0.01 }],
      }),
    ).toThrow();
  });

  it('rejects an empty basket and absurd quantities', () => {
    expect(() => createOrderSchema.parse({ ...validOrder, items: [] })).toThrow();
    expect(() =>
      createOrderSchema.parse({
        ...validOrder,
        items: [{ productId: 'p1', quantity: 0 }],
      }),
    ).toThrow();
    expect(() =>
      createOrderSchema.parse({
        ...validOrder,
        items: [{ productId: 'p1', quantity: 9999 }],
      }),
    ).toThrow();
    expect(() =>
      createOrderSchema.parse({
        ...validOrder,
        items: [{ productId: 'p1', quantity: 1.5 }],
      }),
    ).toThrow();
  });

  it('validates the delivery address', () => {
    expect(() =>
      createOrderSchema.parse({
        ...validOrder,
        deliveryAddress: { ...validOrder.deliveryAddress, postalCode: 'abc' },
      }),
    ).toThrow();
  });
});

/** Minimal stand-in for a Firestore snapshot. */
function snapshot(data: Record<string, unknown>, id = 'order-1') {
  return { id, data: () => data } as never;
}

describe('toOrder audience scoping', () => {
  const document = {
    customerId: 'cust-1',
    storeId: 'store-1',
    driverId: 'driver-1',
    status: 'picked_up',
    deliveryCode: '482913',
    subtotal: 100,
    deliveryFee: 20,
    total: 120,
  };

  it('gives the delivery code to the customer', () => {
    // The customer has to read it aloud to the driver at the door.
    expect(toOrder(snapshot(document), 'customer').deliveryCode).toBe('482913');
  });

  it('gives the delivery code to an admin', () => {
    expect(toOrder(snapshot(document), 'admin').deliveryCode).toBe('482913');
  });

  it('never gives the delivery code to the driver', () => {
    // This is the whole fix. If the driver can read the code, they can
    // confirm a delivery that never happened.
    const order = toOrder(snapshot(document), 'driver');
    expect(order.deliveryCode).toBeUndefined();
    expect(JSON.stringify(order)).not.toContain('482913');
  });

  it('never gives the delivery code to the vendor', () => {
    const order = toOrder(snapshot(document), 'vendor');
    expect(order.deliveryCode).toBeUndefined();
    expect(JSON.stringify(order)).not.toContain('482913');
  });

  it('also hides the legacy deliveryOTP field from the driver', () => {
    // Orders written by the old web checkout store the code under a
    // different key; hiding only the new name would leak every old order.
    const legacy = snapshot({ ...document, deliveryCode: undefined, deliveryOTP: '1234' });
    expect(toOrder(legacy, 'driver').deliveryCode).toBeUndefined();
    expect(toOrder(legacy, 'customer').deliveryCode).toBe('1234');
  });
});

describe('toOrder normalisation', () => {
  it('reads line items written by the old checkout', () => {
    // The web cart nested the whole product object under `product`.
    const order = toOrder(
      snapshot({
        items: [
          { product: { id: 'p1', name: 'Kota', price: 45 }, quantity: 2 },
        ],
      }),
      'customer',
    );

    expect(order.items[0]).toMatchObject({
      productId: 'p1',
      name: 'Kota',
      price: 45,
      quantity: 2,
      lineTotal: 90,
    });
  });

  it('falls back to a safe status rather than trusting stored junk', () => {
    const order = toOrder(snapshot({ status: 'not-a-status' }), 'customer');
    expect(ORDER_STATUSES).toContain(order.status as OrderStatus);
    expect(order.status).toBe('pending');
  });

  it('reports legacy deliveryOTPVerified as delivery verification', () => {
    expect(
      toOrder(snapshot({ deliveryOTPVerified: true }), 'customer')
        .deliveryVerified,
    ).toBe(true);
  });

  it('never emits NaN for missing money fields', () => {
    const order = toOrder(snapshot({}), 'customer');
    for (const value of [
      order.subtotal,
      order.total,
      order.deliveryFee,
      order.vendorPayout,
      order.driverPayout,
      order.platformEarnings,
    ]) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });
});
