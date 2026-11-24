/**
 * A day's money, added up.
 *
 * The brief this answers: "do not assume money collected, platform revenue,
 * vendor earnings and driver earnings are the same thing." They never are,
 * and on a cash order they are not even held by the same person - the
 * customer pays the driver at the door and the platform sees none of it.
 *
 * So these check the four quantities separately, and check that the day is
 * told to add up rather than assumed to.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { Collections, db } from '../../config/firebase';
import { DELIVERY_FEE } from '../../lib/money';
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
import { dayBounds } from './reconciliation.service';

let app: Application;
let admin: TestAccount;
let customer: TestAccount;
let storeId: string;

const DAY = '2026-11-20';

/** Place an order inside the reported day, whatever today happens to be. */
async function orderOnTheDay(options: {
  paymentMethod?: 'cash' | 'yoco';
  subtotal?: number;
  status?: string;
  cashGivenToVendor?: boolean;
  refundedAmount?: number;
  hoursIntoDay?: number;
} = {}) {
  const orderId = await seedOrder({
    customerId: 'cust-1',
    storeId,
    storeName: 'Mama Ntuli',
    driverId: 'drv-1',
    status: options.status ?? 'delivered',
    paymentMethod: options.paymentMethod ?? 'yoco',
    subtotal: options.subtotal ?? 100,
  });

  const { from } = dayBounds(DAY);
  const placedAt = new Date(
    from.getTime() + (options.hoursIntoDay ?? 12) * 60 * 60 * 1000,
  );

  await db
    .collection(Collections.orders)
    .doc(orderId)
    .update({
      createdAt: placedAt,
      ...(options.cashGivenToVendor === undefined
        ? {}
        : { cashGivenToVendor: options.cashGivenToVendor }),
      ...(options.refundedAmount === undefined
        ? {}
        : { refundedAmount: options.refundedAmount }),
    });

  return orderId;
}

const report = (date = DAY, as: TestAccount = admin) =>
  request(app)
    .get(`/api/v1/reports/reconciliation/${date}`)
    .set(...as.authHeader);

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [admin, customer] = await Promise.all([
    createTestAccount({ uid: 'admin-1', role: 'admin' }),
    createTestAccount({ uid: 'cust-1', role: 'customer' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'admin-1', role: 'admin' }),
    seedUser({ uid: 'cust-1', role: 'customer' }),
    seedUser({ uid: 'vend-1', role: 'vendor' }),
    seedUser({ uid: 'drv-1', role: 'driver' }),
  ]);

  storeId = await seedStore({ ownerId: 'vend-1' });
});

describe('what a day collected', () => {
  it('separates what customers paid from what the platform earned', async () => {
    await orderOnTheDay();

    const response = await report();

    expect(response.status).toBe(200);
    // R100 of food and the R12 fee.
    expect(response.body.data.collected.total).toBe(112);
    // 8% of the food, plus R2 of the fee. Not the same number, and never was.
    expect(response.body.data.distributed.platformRevenue).toBe(10);
    expect(response.body.data.distributed.vendorPayouts).toBe(92);
    expect(response.body.data.distributed.driverPay).toBe(10);
  });

  it('says which of it the platform never touched', async () => {
    // Cash is handed to a driver at a door. It is in the day's takings and
    // it is not the platform's money, and one number cannot say both.
    await orderOnTheDay({ paymentMethod: 'yoco' });
    await orderOnTheDay({ paymentMethod: 'cash' });

    const { data } = (await report()).body;

    expect(data.collected.total).toBe(224);
    expect(data.collected.card).toBe(112);
    expect(data.collected.cash).toBe(112);
  });

  it('counts the orders, and how many were cancelled', async () => {
    await orderOnTheDay();
    await orderOnTheDay({ paymentMethod: 'cash' });
    await orderOnTheDay({ status: 'cancelled' });

    const { data } = (await report()).body;

    expect(data.orders).toMatchObject({
      total: 3,
      cash: 1,
      card: 2,
      cancelled: 1,
    });
  });

  it('reports refunds rather than quietly netting them off', async () => {
    await orderOnTheDay({ refundedAmount: 20 });

    const { data } = (await report()).body;

    expect(data.refunds).toEqual({ total: 20, count: 1 });
    // Still the full amount collected: the refund is its own fact.
    expect(data.collected.total).toBe(112);
  });

  it('names cash a driver is still carrying', async () => {
    await orderOnTheDay({ paymentMethod: 'cash', cashGivenToVendor: false });
    await orderOnTheDay({ paymentMethod: 'cash', cashGivenToVendor: true });

    const { data } = (await report()).body;

    expect(data.cashInDriverHands).toEqual({ amount: 100, orders: 1 });
  });
});

describe('whether the day adds up', () => {
  it('says so when it does', async () => {
    await orderOnTheDay();
    await orderOnTheDay({ paymentMethod: 'cash', subtotal: 63.5 });

    const { data } = (await report()).body;

    expect(data.balances).toBe(true);
    expect(data.unbalanced).toEqual([]);
  });

  it('names an order that does not, rather than hiding it in a total', async () => {
    // An order whose split was tampered with, or written before the
    // invariant existed. A report that silently absorbs this is worse than
    // no report at all.
    const orderId = await orderOnTheDay();
    await db
      .collection(Collections.orders)
      .doc(orderId)
      .update({ vendorPayout: 80 });

    const { data } = (await report()).body;

    expect(data.balances).toBe(false);
    expect(data.unbalanced).toEqual([
      { orderId, paid: 112, distributed: 100 },
    ]);
  });
});

describe('which day is which', () => {
  it('uses the South African day, not the UTC one', async () => {
    // 00:30 in Johannesburg is 22:30 the previous day in UTC. An order placed
    // then belongs to this day's takings, and a report that measured UTC
    // would lose the first two hours of every day without saying so.
    await orderOnTheDay({ hoursIntoDay: 0.5 });

    const { data } = (await report()).body;

    expect(data.orders.total).toBe(1);
    expect((await report('2026-11-19')).body.data.orders.total).toBe(0);
  });

  it('leaves out an order from the next day', async () => {
    await orderOnTheDay({ hoursIntoDay: 25 });

    expect((await report()).body.data.orders.total).toBe(0);
  });

  it('refuses a day that is not a day', async () => {
    expect((await report('yesterday')).status).toBe(422);
  });
});

describe('who may read it', () => {
  it('not a customer', async () => {
    expect((await report(DAY, customer)).status).toBe(403);
  });

  it('nobody signed out', async () => {
    const response = await request(app).get(
      `/api/v1/reports/reconciliation/${DAY}`,
    );

    expect(response.status).toBe(401);
  });
});
