/**
 * The console's dashboard numbers.
 *
 * What matters here is that they agree with the things they count. A
 * dashboard that says six orders where there are five is worse than no
 * dashboard: somebody acts on it.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import {
  assertEmulator,
  resetFirestore,
  seedOrder,
  seedStore,
  seedUser,
} from '../../test/support';
import {
  assertAuthEmulator,
  createTestAccount,
  resetAuth,
  type TestAccount,
} from '../../test/auth';
import { computeOrderEconomics } from '../../lib/money';
import { todayInSast } from './metrics.service';

let app: Application;
let admin: TestAccount;
let vendor: TestAccount;

const metrics = (as: TestAccount = admin) =>
  request(app)
    .get('/api/v1/reports/metrics')
    .set(...as.authHeader);

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [admin, vendor] = await Promise.all([
    createTestAccount({ uid: 'admin-1', role: 'admin' }),
    createTestAccount({ uid: 'vend-1', role: 'vendor' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'admin-1', role: 'admin' }),
    seedUser({ uid: 'vend-1', role: 'vendor' }),
    seedUser({ uid: 'cust-1', role: 'customer' }),
  ]);
});

describe('an empty platform', () => {
  it('answers in zeroes rather than failing', async () => {
    const response = await metrics();

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      date: todayInSast(),
      today: { orders: 0, delivered: 0, cancelled: 0, takings: 0 },
      live: { pending: 0, preparing: 0, ready: 0, onTheWay: 0, unclaimed: 0 },
      waiting: { kitchens: 0, drivers: 0, cashDisputes: 0 },
    });
  });
});

describe('today', () => {
  it('counts the orders placed today and what they came to', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });

    // Worked out the way the orders themselves were, rather than typed in:
    // a dashboard that disagrees with the order it is counting is the whole
    // problem being guarded against here.
    const big = computeOrderEconomics(100, 12);
    const small = computeOrderEconomics(80, 12);

    await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'delivered',
      subtotal: 100,
    });
    await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'pending',
      subtotal: 80,
    });

    const { data } = (await metrics()).body;

    expect(data.today).toMatchObject({
      orders: 2,
      delivered: 1,
      takings: 112 + 92,
      platformShare: big.platformEarnings + small.platformEarnings,
    });
  });

  it('leaves a cancelled order out of the takings but not the count', async () => {
    // "We took 12 orders and 2 were cancelled" is the sentence an operator
    // needs; counting the cancelled one's money would not be.
    const storeId = await seedStore({ ownerId: 'vend-1' });

    await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'cancelled',
      subtotal: 95,
    });

    const { data } = (await metrics()).body;

    expect(data.today).toMatchObject({
      orders: 1,
      cancelled: 1,
      takings: 0,
      platformShare: 0,
    });
  });

  it('ignores an order from another day', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'delivered',
    });

    await db
      .collection(Collections.orders)
      .doc(orderId)
      .update({ createdAt: new Date('2026-01-05T09:00:00.000Z') });

    expect((await metrics()).body.data.today.orders).toBe(0);
  });
});

describe('what is waiting for a person', () => {
  it('counts kitchens nobody has reviewed', async () => {
    await seedStore({ ownerId: 'vend-1', verification: 'pending' });
    await seedStore({ ownerId: 'vend-1', verification: 'approved' });

    expect((await metrics()).body.data.waiting.kitchens).toBe(1);
  });

  it('does not count a kitchen that predates the review queue', async () => {
    // No field at all: trading since before anybody reviewed anything, and
    // not sitting in a queue waiting for an answer.
    const storeId = await seedStore({ ownerId: 'vend-1' });
    await db
      .collection(Collections.stores)
      .doc(storeId)
      .update({ verification: FieldValue.delete() });

    expect((await metrics()).body.data.waiting.kitchens).toBe(0);
  });
});

describe('orders in flight', () => {
  it('counts them by what stage they are at', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });

    await seedOrder({ customerId: 'cust-1', storeId, status: 'pending' });
    await seedOrder({ customerId: 'cust-1', storeId, status: 'preparing' });
    await seedOrder({ customerId: 'cust-1', storeId, status: 'preparing' });
    await seedOrder({ customerId: 'cust-1', storeId, status: 'delivered' });

    expect((await metrics()).body.data.live).toMatchObject({
      pending: 1,
      preparing: 2,
      ready: 0,
      onTheWay: 0,
    });
  });
});

describe('who may read it', () => {
  it('not a vendor', async () => {
    expect((await metrics(vendor)).status).toBe(403);
  });

  it('not somebody signed out', async () => {
    expect(
      (await request(app).get('/api/v1/reports/metrics')).status,
    ).toBe(401);
  });
});
