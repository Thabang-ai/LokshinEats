/**
 * Customer notifications, end to end against the emulators.
 *
 * Three promises are checked here. The customer hears about the four moments
 * they wait for, once each. A push never carries the delivery code. And a
 * notification that fails to send never undoes the order event behind it.
 */

import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { Collections, db } from '../../config/firebase';
import {
  actor,
  assertEmulator,
  readOrderSecret,
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
import { registerPaymentProviders } from '../payments/payment.bootstrap';
import { resetProviders } from '../payments/payment.provider';
import * as orderService from '../orders/order.service';
import * as notificationService from './notification.service';
import {
  resetPushSender,
  usePushSender,
  type PushPayload,
  type PushSender,
} from './push';

const CUSTOMER = 'cust-1';
const VENDOR = 'vend-1';
const DRIVER = 'drv-1';

const vendor = actor(VENDOR, 'vendor');
const driver = actor(DRIVER, 'driver');
const admin = actor('admin-1', 'admin');
const customer = actor(CUSTOMER, 'customer');

/** Records what would have been pushed, instead of pushing it. */
function recordingSender(options: { dead?: string[]; fail?: boolean } = {}) {
  const sent: Array<{ tokens: string[]; payload: PushPayload }> = [];
  const sender: PushSender = {
    name: 'recording',
    async send(tokens, payload) {
      if (options.fail) throw new Error('push service unavailable');
      sent.push({ tokens, payload });
      return { deadTokens: options.dead ?? [] };
    },
  };
  return { sender, sent };
}

async function inbox(userId: string) {
  const snapshot = await db
    .collection(Collections.notifications)
    .where('userId', '==', userId)
    .get();
  return snapshot.docs.map((d) => d.data());
}

const TOKEN = 'device-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeAll(() => {
  assertEmulator();
  resetProviders();
  registerPaymentProviders();
});

beforeEach(async () => {
  await resetFirestore();
  await seedUser({ uid: CUSTOMER, role: 'customer' });
});

afterEach(() => resetPushSender());

describe('the moments a customer hears about', () => {
  it('the kitchen accepting, once however it gets there', async () => {
    const storeId = await seedStore({ ownerId: VENDOR, name: 'Mama Ntuli' });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      storeName: 'Mama Ntuli',
    });

    await orderService.changeStatus(vendor, orderId, 'confirmed');
    await orderService.changeStatus(vendor, orderId, 'preparing');

    const notes = await inbox(CUSTOMER);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.kind).toBe('order_accepted');
    expect(notes[0]!.title).toBe('Mama Ntuli is making your order');
    expect(notes[0]!.readAt).toBeNull();
  });

  it('the food leaving with a driver, without the delivery code', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'ready',
      deliveryCode: '482913',
    });

    // Claiming a ready order is the collection.
    await orderService.acceptOrder(driver, orderId);

    const notes = await inbox(CUSTOMER);
    expect(notes.map((n) => n.kind)).toEqual(['order_on_the_way']);

    // The code is the customer's proof at the door, and a push can be read
    // off a locked phone. It must not be in anything we send.
    const code = await readOrderSecret(orderId);
    expect(code).toBeTruthy();
    expect(JSON.stringify(notes)).not.toContain(code!);
  });

  it('the delivery', async () => {
    const storeId = await seedStore({ ownerId: VENDOR, name: 'Mama Ntuli' });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      storeName: 'Mama Ntuli',
      driverId: DRIVER,
      status: 'picked_up',
      deliveryCode: '482913',
    });

    await orderService.confirmDelivery(driver, orderId, '482913');

    const notes = await inbox(CUSTOMER);
    expect(notes.map((n) => n.kind)).toEqual(['order_delivered']);
    expect(notes[0]!.body).toContain('Mama Ntuli');
  });

  it('a cancellation, with what it cost them', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'preparing',
      paymentStatus: 'paid',
      subtotal: 100,
      deliveryFee: 20,
    });

    await orderService.changeStatus(admin, orderId, 'cancelled');

    const notes = await inbox(CUSTOMER);
    expect(notes.map((n) => n.kind)).toEqual(['order_cancelled']);
    // Mid-prep: the food (R92 to the kitchen) is paid for, the rest comes back.
    expect(notes[0]!.body).toBe('R28.00 is back in your LokshinEats wallet.');
  });

  it('nothing for a wrong delivery code', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      status: 'picked_up',
      deliveryCode: '482913',
    });

    await orderService.confirmDelivery(driver, orderId, '000000');

    expect(await inbox(CUSTOMER)).toHaveLength(0);
  });
});

describe('pushing to a phone', () => {
  it("pushes a new notification to the customer's registered device", async () => {
    const { sender, sent } = recordingSender();
    usePushSender(sender);
    await notificationService.registerDevice(customer, {
      token: TOKEN,
      platform: 'android',
    });

    const storeId = await seedStore({ ownerId: VENDOR, name: 'Mama Ntuli' });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      storeName: 'Mama Ntuli',
    });
    await orderService.changeStatus(vendor, orderId, 'preparing');

    expect(sent).toHaveLength(1);
    expect(sent[0]!.tokens).toEqual([TOKEN]);
    expect(sent[0]!.payload).toMatchObject({
      kind: 'order_accepted',
      orderId,
      title: 'Mama Ntuli is making your order',
    });
  });

  it('records but does not push a cancellation the customer made themselves', async () => {
    const { sender, sent } = recordingSender();
    usePushSender(sender);
    await notificationService.registerDevice(customer, {
      token: TOKEN,
      platform: 'android',
    });

    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: CUSTOMER, storeId });
    await orderService.changeStatus(customer, orderId, 'cancelled');

    expect(sent).toHaveLength(0);
    expect((await inbox(CUSTOMER)).map((n) => n.kind)).toEqual([
      'order_cancelled',
    ]);
  });

  it('forgets a device the push service says is gone', async () => {
    const { sender } = recordingSender({ dead: [TOKEN] });
    usePushSender(sender);
    await notificationService.registerDevice(customer, {
      token: TOKEN,
      platform: 'ios',
    });

    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: CUSTOMER, storeId });
    await orderService.changeStatus(vendor, orderId, 'preparing');

    const devices = await db.collection(Collections.deviceTokens).get();
    expect(devices.size).toBe(0);
  });

  it('a push failure never undoes the order event behind it', async () => {
    const { sender } = recordingSender({ fail: true });
    usePushSender(sender);
    await notificationService.registerDevice(customer, {
      token: TOKEN,
      platform: 'android',
    });

    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: CUSTOMER, storeId });

    const updated = await orderService.changeStatus(vendor, orderId, 'preparing');

    expect(updated.status).toBe('preparing');
    // The inbox still has it; only the buzz was lost.
    expect(await inbox(CUSTOMER)).toHaveLength(1);
  });
});

describe('the inbox over HTTP', () => {
  let app: Application;
  let me: TestAccount;
  let someoneElse: TestAccount;

  beforeAll(() => {
    assertAuthEmulator();
    app = createApp();
  });

  beforeEach(async () => {
    await resetAuth();
    [me, someoneElse] = await Promise.all([
      createTestAccount({ uid: CUSTOMER, role: 'customer' }),
      createTestAccount({ uid: 'cust-2', role: 'customer' }),
    ]);
    await seedUser({ uid: 'cust-2', role: 'customer' });
  });

  async function notified(orderId: string) {
    await notificationService.notifyCustomer({
      customerId: CUSTOMER,
      orderId,
      kind: 'order_delivered',
      facts: { storeName: 'Mama Ntuli' },
    });
  }

  it('lists only the caller’s own, newest first, with the unread count', async () => {
    await notified('order-1');
    await notified('order-2');

    const mine = await request(app)
      .get('/api/v1/notifications')
      .set(...me.authHeader);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(2);
    expect(mine.body.meta.unread).toBe(2);

    const theirs = await request(app)
      .get('/api/v1/notifications')
      .set(...someoneElse.authHeader);
    expect(theirs.body.data).toHaveLength(0);
  });

  it('marks one read, and refuses someone else’s as missing', async () => {
    await notified('order-1');
    const list = await request(app)
      .get('/api/v1/notifications')
      .set(...me.authHeader);
    const id = list.body.data[0].id;

    const byStranger = await request(app)
      .post(`/api/v1/notifications/${id}/read`)
      .set(...someoneElse.authHeader);
    expect(byStranger.status).toBe(404);

    const byMe = await request(app)
      .post(`/api/v1/notifications/${id}/read`)
      .set(...me.authHeader);
    expect(byMe.status).toBe(200);
    expect(byMe.body.data.readAt).toBeTruthy();

    const after = await request(app)
      .get('/api/v1/notifications')
      .set(...me.authHeader);
    expect(after.body.meta.unread).toBe(0);
  });

  it('marks everything read at once', async () => {
    await notified('order-1');
    await notified('order-2');

    const response = await request(app)
      .post('/api/v1/notifications/read-all')
      .set(...me.authHeader);
    expect(response.body.data.updated).toBe(2);
  });

  it('a device moves to whoever signed in on it last', async () => {
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...me.authHeader)
      .send({ token: TOKEN, platform: 'web' })
      .expect(204);

    // Same phone, another account.
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...someoneElse.authHeader)
      .send({ token: TOKEN, platform: 'web' })
      .expect(204);

    const devices = await db.collection(Collections.deviceTokens).get();
    expect(devices.size).toBe(1);
    expect(devices.docs[0]!.get('userId')).toBe('cust-2');

    // The first account signing out cannot remove the second's device.
    await request(app)
      .post('/api/v1/notifications/devices/remove')
      .set(...me.authHeader)
      .send({ token: TOKEN })
      .expect(204);
    expect((await db.collection(Collections.deviceTokens).get()).size).toBe(1);
  });

  it('needs a signed-in caller', async () => {
    const response = await request(app).get('/api/v1/notifications');
    expect(response.status).toBe(401);
  });
});
