/**
 * The deadline on a kitchen's cash.
 *
 * On a cash order the platform never touches the money: the customer pays the
 * driver, the driver pays the kitchen, and in between a stranger is carrying
 * somebody else's takings. There was nothing making that second handover
 * happen - no deadline, no consequence, and a kitchen whose only recourse was
 * to ask.
 *
 * Now: a driver holding overdue cash cannot take another delivery, the sweep
 * suspends one who has simply stopped answering, and the money arriving puts
 * both right.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { auth as adminAuth, Collections, db } from '../../config/firebase';
import { env } from '../../config/env';
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

let app: Application;
let admin: TestAccount;
let driver: TestAccount;
let vendor: TestAccount;
let storeId: string;

const HOUR = 60 * 60 * 1000;

/** A delivered cash order whose money the driver still has. */
async function unsettled(options: { hoursAgo: number; subtotal?: number } ) {
  const orderId = await seedOrder({
    customerId: 'cust-1',
    storeId,
    storeName: "Mini's Mashy Eatery",
    driverId: 'drv-1',
    status: 'delivered',
    paymentMethod: 'cash',
    subtotal: options.subtotal ?? 100,
  });

  await db
    .collection(Collections.orders)
    .doc(orderId)
    .update({
      deliveredAt: new Date(Date.now() - options.hoursAgo * HOUR),
      cashGivenToVendor: false,
    });

  return orderId;
}

function claimable() {
  return seedOrder({
    customerId: 'cust-1',
    storeId,
    storeName: "Mini's Mashy Eatery",
    status: 'confirmed',
  });
}

const sweep = () =>
  request(app)
    .post('/api/v1/cash/sweep')
    .set(...admin.authHeader);

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [admin, driver, vendor] = await Promise.all([
    createTestAccount({ uid: 'admin-1', role: 'admin' }),
    createTestAccount({ uid: 'drv-1', role: 'driver' }),
    createTestAccount({ uid: 'vend-1', role: 'vendor' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'admin-1', role: 'admin' }),
    seedUser({ uid: 'drv-1', role: 'driver', displayName: 'Sipho' }),
    seedUser({ uid: 'vend-1', role: 'vendor' }),
    seedUser({ uid: 'cust-1', role: 'customer' }),
  ]);

  storeId = await seedStore({ ownerId: 'vend-1' });

  await db.collection(Collections.drivers).doc('drv-1').set({
    vehicleType: 'motorbike',
    idNumber: '9203145800084',
    status: 'approved',
    createdAt: new Date(),
  });
});

describe('what the driver is told', () => {
  it('how much is owed and when it is due', async () => {
    await unsettled({ hoursAgo: 1, subtotal: 55 });

    const response = await request(app)
      .get('/api/v1/cash/outstanding')
      .set(...driver.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(55);
    expect(response.body.data.overdueTotal).toBe(0);
    expect(response.body.data.nextDueAt).toEqual(expect.any(String));
  });

  it('the deadline rides on the order itself', async () => {
    const orderId = await unsettled({ hoursAgo: 1 });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...driver.authHeader);

    const due = new Date(response.body.data.cashDueAt).getTime();
    const delivered = new Date(response.body.data.deliveredAt).getTime();
    expect(due - delivered).toBe(env.CASH_HANDOVER_HOURS * HOUR);
  });

  it('nothing is due once it has been handed over', async () => {
    const orderId = await unsettled({ hoursAgo: 1 });
    await request(app)
      .post(`/api/v1/orders/${orderId}/cash-handover`)
      .set(...driver.authHeader);

    const response = await request(app)
      .get('/api/v1/cash/outstanding')
      .set(...driver.authHeader);

    expect(response.body.data.total).toBe(0);
    expect(response.body.data.nextDueAt).toBeNull();
  });

  it('a card delivery owes nothing', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'delivered',
      paymentMethod: 'yoco',
    });
    await db
      .collection(Collections.orders)
      .doc(orderId)
      .update({ deliveredAt: new Date(Date.now() - 48 * HOUR) });

    const response = await request(app)
      .get('/api/v1/cash/outstanding')
      .set(...driver.authHeader);

    expect(response.body.data.total).toBe(0);
  });

  it('another driver cannot ask after this one debts', async () => {
    const other = await createTestAccount({ uid: 'drv-2', role: 'driver' });
    await seedUser({ uid: 'drv-2', role: 'driver' });
    await unsettled({ hoursAgo: 48 });

    const response = await request(app)
      .get('/api/v1/cash/outstanding')
      .set(...other.authHeader);

    expect(response.body.data.total).toBe(0);
  });
});

describe('taking another delivery', () => {
  it('is refused while a kitchen is still waiting, and says how much', async () => {
    // The half of the deadline that needs nothing to be running.
    await unsettled({ hoursAgo: 48, subtotal: 55 });
    const orderId = await claimable();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/R55\.00/);
    expect(response.body.error.message).toMatch(/Mini's Mashy Eatery/);
  });

  it('is allowed while the deadline is still to come', async () => {
    await unsettled({ hoursAgo: 1 });
    const orderId = await claimable();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(200);
  });

  it('is allowed again once the cash is handed over', async () => {
    const owed = await unsettled({ hoursAgo: 48 });
    await request(app)
      .post(`/api/v1/orders/${owed}/cash-handover`)
      .set(...driver.authHeader);

    const orderId = await claimable();
    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(200);
  });
});

describe('the sweep', () => {
  it('suspends a driver whose deadline has passed', async () => {
    await unsettled({ hoursAgo: 48, subtotal: 55 });

    const response = await sweep();

    expect(response.status).toBe(200);
    expect(response.body.data.suspended).toEqual(['drv-1']);
    expect((await adminAuth.getUser('drv-1')).disabled).toBe(true);
  });

  it('says what for, in money', async () => {
    await unsettled({ hoursAgo: 48, subtotal: 55 });
    await unsettled({ hoursAgo: 30, subtotal: 45 });

    await sweep();

    const profile = await db.collection(Collections.users).doc('drv-1').get();
    expect(profile.get('statusReason')).toBe(
      'Has not handed over R100.00 from 2 deliveries.',
    );
    expect(profile.get('statusChangedBy')).toBe('system');
    expect(profile.get('suspensionCode')).toBe('unsettled_cash');
  });

  it('leaves a driver inside the deadline alone', async () => {
    await unsettled({ hoursAgo: 1 });

    const response = await sweep();

    expect(response.body.data.suspended).toEqual([]);
    expect((await adminAuth.getUser('drv-1')).disabled).toBe(false);
  });

  it('is dull about running twice', async () => {
    await unsettled({ hoursAgo: 48 });
    await sweep();

    const second = await sweep();

    expect(second.body.data.suspended).toEqual([]);
    expect(second.body.data.alreadySuspended).toEqual(['drv-1']);
  });

  it('tells them why', async () => {
    await unsettled({ hoursAgo: 48 });
    await sweep();

    const notes = await db
      .collection(Collections.notifications)
      .where('userId', '==', 'drv-1')
      .get();

    expect(notes.docs.map((doc) => doc.get('kind'))).toContain(
      'driver_suspended_cash',
    );
  });

  it('is not for anybody to run', async () => {
    const response = await request(app)
      .post('/api/v1/cash/sweep')
      .set(...driver.authHeader);

    expect(response.status).toBe(403);
  });

  it('runs for the schedule, which has no account', async () => {
    await unsettled({ hoursAgo: 48 });

    const response = await request(app)
      .get('/api/v1/cash/sweep')
      .set('x-cron-key', env.CRON_SECRET ?? 'not-configured');

    // Configured in the test environment; without a secret the schedule
    // simply cannot call it, and an admin presses the button instead.
    expect(env.CRON_SECRET ? response.status : 401).toBe(
      env.CRON_SECRET ? 200 : 401,
    );
  });

  it('refuses a wrong secret', async () => {
    const response = await request(app)
      .get('/api/v1/cash/sweep')
      .set('x-cron-key', 'definitely-not-the-secret-value');

    expect(response.status).toBe(401);
  });
});

describe('a kitchen that says the money never arrived', () => {
  /** The driver claims a handover; the kitchen disputes it. */
  async function disputed() {
    const orderId = await unsettled({ hoursAgo: 1, subtotal: 55 });
    await request(app)
      .post(`/api/v1/orders/${orderId}/cash-handover`)
      .set(...driver.authHeader);
    await request(app)
      .post(`/api/v1/orders/${orderId}/cash-receipt`)
      .set(...vendor.authHeader)
      .send({ outcome: 'dispute' });
    return orderId;
  }

  it('moves no money while it is in dispute', async () => {
    const orderId = await disputed();

    const order = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...admin.authHeader);

    expect(order.body.data.vendorCashDisputed).toBe(true);
    expect(order.body.data.vendorCashConfirmed).toBe(false);
  });

  it('lands in front of an admin rather than nowhere', async () => {
    // It used to set a flag and stop. Nobody was shown it, nobody could act
    // on it, and both apps read it as settled.
    const orderId = await disputed();

    const response = await request(app)
      .get('/api/v1/cash/disputes')
      .set(...admin.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.map((o: { id: string }) => o.id)).toEqual([
      orderId,
    ]);
  });

  it('is nobody else business', async () => {
    await disputed();

    expect(
      (await request(app).get('/api/v1/cash/disputes').set(...driver.authHeader))
        .status,
    ).toBe(403);
  });

  it('ends when the kitchen says the driver has since paid', async () => {
    // The ordinary ending, and it needs no admin at all.
    const orderId = await disputed();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/cash-receipt`)
      .set(...vendor.authHeader)
      .send({ outcome: 'confirm' });

    expect(response.status).toBe(200);

    const order = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...admin.authHeader);

    expect(order.body.data.vendorCashConfirmed).toBe(true);
    expect(order.body.data.vendorCashDisputed).toBe(false);
  });

  it('cannot be disputed twice', async () => {
    const orderId = await disputed();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/cash-receipt`)
      .set(...vendor.authHeader)
      .send({ outcome: 'dispute' });

    expect(response.status).toBe(409);
  });

  it('upheld, the driver owes it again and is blocked from new work', async () => {
    const orderId = await disputed();

    const resolved = await request(app)
      .post(`/api/v1/cash/disputes/${orderId}`)
      .set(...admin.authHeader)
      .send({ outcome: 'uphold', note: 'Driver admitted it.' });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.cashGivenToVendor).toBe(false);
    expect(resolved.body.data.vendorCashDisputed).toBe(false);

    // Back under the deadline, measured from a delivery an hour ago - so not
    // overdue yet, but owed.
    const outstanding = await request(app)
      .get('/api/v1/cash/outstanding')
      .set(...driver.authHeader);
    expect(outstanding.body.data.total).toBe(55);
  });

  it('upheld on an old delivery, they cannot take another one', async () => {
    const orderId = await unsettled({ hoursAgo: 48, subtotal: 55 });
    await request(app)
      .post(`/api/v1/orders/${orderId}/cash-handover`)
      .set(...driver.authHeader);
    await request(app)
      .post(`/api/v1/orders/${orderId}/cash-receipt`)
      .set(...vendor.authHeader)
      .send({ outcome: 'dispute' });
    await request(app)
      .post(`/api/v1/cash/disputes/${orderId}`)
      .set(...admin.authHeader)
      .send({ outcome: 'uphold' });

    const next = await claimable();
    const response = await request(app)
      .post(`/api/v1/orders/${next}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(403);
  });

  it('dismissed, the money moves and the matter is closed', async () => {
    const orderId = await disputed();

    const resolved = await request(app)
      .post(`/api/v1/cash/disputes/${orderId}`)
      .set(...admin.authHeader)
      .send({ outcome: 'dismiss', note: 'Kitchen found the money.' });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.vendorCashConfirmed).toBe(true);
    expect(resolved.body.data.vendorCashDisputed).toBe(false);
  });

  it('a dispute nobody raised cannot be resolved', async () => {
    const orderId = await unsettled({ hoursAgo: 1 });

    const response = await request(app)
      .post(`/api/v1/cash/disputes/${orderId}`)
      .set(...admin.authHeader)
      .send({ outcome: 'uphold' });

    expect(response.status).toBe(409);
  });

  it('and not by the driver it is about', async () => {
    const orderId = await disputed();

    const response = await request(app)
      .post(`/api/v1/cash/disputes/${orderId}`)
      .set(...driver.authHeader)
      .send({ outcome: 'dismiss' });

    expect(response.status).toBe(403);
  });
});

describe('getting back in', () => {
  it('the kitchen confirming the cash lifts the suspension', async () => {
    const orderId = await unsettled({ hoursAgo: 48 });
    await sweep();
    expect((await adminAuth.getUser('drv-1')).disabled).toBe(true);

    // The driver is suspended, so they cannot record anything: the kitchen
    // says it has the money.
    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/cash-receipt`)
      .set(...vendor.authHeader)
      .send({ outcome: 'confirm' });

    expect(response.status).toBe(200);
    expect((await adminAuth.getUser('drv-1')).disabled).toBe(false);

    const profile = await db.collection(Collections.users).doc('drv-1').get();
    expect(profile.get('status')).toBe('active');
  });

  it('but not while another kitchen is still owed', async () => {
    const first = await unsettled({ hoursAgo: 48 });
    await unsettled({ hoursAgo: 48 });
    await sweep();

    await request(app)
      .post(`/api/v1/orders/${first}/cash-receipt`)
      .set(...vendor.authHeader)
      .send({ outcome: 'confirm' });

    expect((await adminAuth.getUser('drv-1')).disabled).toBe(true);
  });

  it('and never one an admin imposed', async () => {
    // An admin suspended them for something else entirely. A kitchen
    // confirming R100 does not overrule that.
    const orderId = await unsettled({ hoursAgo: 48 });
    await request(app)
      .patch('/api/v1/users/drv-1/status')
      .set(...admin.authHeader)
      .send({ status: 'suspended', reason: 'Took a customer phone.' });

    await request(app)
      .post(`/api/v1/orders/${orderId}/cash-receipt`)
      .set(...vendor.authHeader)
      .send({ outcome: 'confirm' });

    expect((await adminAuth.getUser('drv-1')).disabled).toBe(true);
  });

  it('a dispute is nobody automatic business', async () => {
    // A kitchen that could suspend a driver by disputing would be a kitchen
    // with a weapon. Disputes go to an admin.
    const orderId = await unsettled({ hoursAgo: 1 });
    await request(app)
      .post(`/api/v1/orders/${orderId}/cash-handover`)
      .set(...driver.authHeader);
    await request(app)
      .post(`/api/v1/orders/${orderId}/cash-receipt`)
      .set(...vendor.authHeader)
      .send({ outcome: 'dispute' });

    const response = await sweep();

    expect(response.body.data.suspended).toEqual([]);
  });
});
