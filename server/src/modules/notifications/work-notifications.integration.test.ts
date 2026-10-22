/**
 * The notifications that reach the people doing the work.
 *
 * A kitchen that is not told an order arrived finds out by watching a screen,
 * and a driver who is not told a delivery exists has to keep refreshing a
 * board. Both were missing until these.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Collections, db } from '../../config/firebase';
import {
  actor,
  assertEmulator,
  resetFirestore,
  seedProduct,
  seedStore,
  seedUser,
} from '../../test/support';
import { registerPaymentProviders } from '../payments/payment.bootstrap';
import { resetProviders } from '../payments/payment.provider';
import * as orderService from '../orders/order.service';

const CUSTOMER = 'cust-1';
const VENDOR = 'vend-1';
const DRIVER_A = 'drv-a';
const DRIVER_B = 'drv-b';

const customer = actor(CUSTOMER, 'customer');
const vendor = actor(VENDOR, 'vendor');

async function inbox(userId: string) {
  const snapshot = await db
    .collection(Collections.notifications)
    .where('userId', '==', userId)
    .get();
  return snapshot.docs.map((d) => d.data());
}

beforeAll(() => {
  assertEmulator();
  resetProviders();
  registerPaymentProviders();
});

beforeEach(async () => {
  await resetFirestore();
  await Promise.all([
    seedUser({ uid: CUSTOMER, role: 'customer' }),
    seedUser({ uid: VENDOR, role: 'vendor' }),
    seedUser({ uid: DRIVER_A, role: 'driver' }),
    seedUser({ uid: DRIVER_B, role: 'driver' }),
  ]);
});

async function placeOrder(): Promise<string> {
  const storeId = await seedStore({ ownerId: VENDOR, name: 'Mama Ntuli' });
  const productId = await seedProduct({ storeId, price: 45.5 });

  const order = await orderService.placeOrder(customer, {
    storeId,
    items: [{ productId, quantity: 2 }],
    deliveryAddress: {
      street: '12 Vilakazi Street',
      city: 'Soweto',
      postalCode: '1804',
    },
    paymentMethod: 'cash',
    customerPhone: '0821234567',
  });

  return order.id;
}

describe('the kitchen', () => {
  it('is told as soon as an order is placed', async () => {
    const orderId = await placeOrder();

    const notes = await inbox(VENDOR);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.kind).toBe('order_placed');
    expect(notes[0]!.title).toBe('New order');
    expect(notes[0]!.orderId).toBe(orderId);
  });

  it('is told what the job is: how many dishes, and what it comes to', async () => {
    await placeOrder();

    const notes = await inbox(VENDOR);
    // Two of a R45.50 dish, plus the delivery fee.
    expect(notes[0]!.body).toContain('2 items');
    expect(notes[0]!.body).toContain('R');
  });

  it('is not told about a customer notification', async () => {
    await placeOrder();

    const notes = await inbox(CUSTOMER);
    expect(notes).toHaveLength(0);
  });
});

describe('drivers', () => {
  it('hear when a kitchen accepts, which is when the job can be claimed', async () => {
    const orderId = await placeOrder();

    await orderService.changeStatus(vendor, orderId, 'confirmed');

    for (const driver of [DRIVER_A, DRIVER_B]) {
      const notes = await inbox(driver);
      expect(notes, driver).toHaveLength(1);
      expect(notes[0]!.kind).toBe('delivery_available');
      expect(notes[0]!.title).toBe('Delivery available');
      // What the delivery pays is what decides a driver to take it.
      expect(notes[0]!.body).toContain('Mama Ntuli');
    }
  });

  it('hear nothing before the kitchen has accepted', async () => {
    await placeOrder();

    expect(await inbox(DRIVER_A)).toHaveLength(0);
  });

  it('are told once, however many times the order moves on', async () => {
    const orderId = await placeOrder();

    await orderService.changeStatus(vendor, orderId, 'confirmed');
    await orderService.changeStatus(vendor, orderId, 'preparing');
    await orderService.changeStatus(vendor, orderId, 'ready');

    expect(await inbox(DRIVER_A)).toHaveLength(1);
  });

  it('never see the delivery code in a notification', async () => {
    // Pushes land on lock screens, and the code is the customer's proof the
    // food reached them.
    const orderId = await placeOrder();
    await orderService.changeStatus(vendor, orderId, 'confirmed');

    const secret = await db.collection('orderSecrets').doc(orderId).get();
    const code = String(secret.get('code') ?? '');
    expect(code).not.toBe('');

    const notes = await inbox(DRIVER_A);
    expect(`${notes[0]!.title} ${notes[0]!.body}`).not.toContain(code);
  });
});
