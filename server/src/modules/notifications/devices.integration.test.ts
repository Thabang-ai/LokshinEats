/**
 * Devices, and who a push can possibly reach.
 *
 * The rules being held to here:
 *   - a device belongs to the account that registered it, taken from the
 *     verified token and never from the request body;
 *   - no endpoint hands back anyone's tokens, including your own;
 *   - a notification goes to the app it belongs in, so a delivery offer does
 *     not surface in the app someone orders dinner with;
 *   - and one person's notification never reaches another person's device.
 */

import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { Collections, db } from '../../config/firebase';
import { assertEmulator, resetFirestore, seedUser } from '../../test/support';
import {
  assertAuthEmulator,
  createTestAccount,
  resetAuth,
  type TestAccount,
} from '../../test/auth';
import * as notificationService from './notification.service';
import {
  resetPushSender,
  usePushSender,
  type PushPayload,
  type PushSender,
} from './push';

const token = (suffix: string) => `device-token-${suffix.padEnd(24, 'x')}`;

function recordingSender() {
  const sent: Array<{ tokens: string[]; payload: PushPayload }> = [];
  const sender: PushSender = {
    name: 'recording',
    async send(tokens, payload) {
      sent.push({ tokens, payload });
      return { deadTokens: [] };
    },
  };
  return { sender, sent };
}

let app: Application;
let alice: TestAccount;
let bob: TestAccount;

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);
  alice = await createTestAccount({ uid: 'alice', role: 'customer' });
  bob = await createTestAccount({ uid: 'bob', role: 'driver' });
  await Promise.all([
    seedUser({ uid: 'alice', role: 'customer' }),
    seedUser({ uid: 'bob', role: 'driver' }),
  ]);
});

afterEach(() => resetPushSender());

const deviceOwners = async () => {
  const snapshot = await db.collection(Collections.deviceTokens).get();
  return snapshot.docs.map((d) => ({
    userId: d.get('userId'),
    app: d.get('app'),
    token: d.get('token'),
  }));
};

describe('registering a device', () => {
  it('binds it to the caller, whatever the body says', async () => {
    const response = await request(app)
      .post('/api/v1/notifications/devices')
      .set(...alice.authHeader)
      .send({ token: token('a'), platform: 'android', app: 'customer' });

    expect(response.status).toBe(204);
    expect(await deviceOwners()).toEqual([
      { userId: 'alice', app: 'customer', token: token('a') },
    ]);
  });

  it('refuses a body trying to name someone else', async () => {
    // The schema is strict, so an extra field is a 400 rather than a silently
    // ignored attempt to register a device for another account.
    const response = await request(app)
      .post('/api/v1/notifications/devices')
      .set(...alice.authHeader)
      .send({
        token: token('a'),
        platform: 'android',
        app: 'customer',
        userId: 'bob',
      });

    expect(response.status).toBe(422);
    expect(await deviceOwners()).toEqual([]);
  });

  it('needs a signed-in caller', async () => {
    const response = await request(app)
      .post('/api/v1/notifications/devices')
      .send({ token: token('a'), platform: 'android' });

    expect(response.status).toBe(401);
  });

  it('registering the same device twice keeps one record', async () => {
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post('/api/v1/notifications/devices')
        .set(...alice.authHeader)
        .send({ token: token('a'), platform: 'android', app: 'customer' });
    }

    expect(await deviceOwners()).toHaveLength(1);
  });

  it('a rotated token is a new device, and the old one can be removed', async () => {
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...alice.authHeader)
      .send({ token: token('old'), platform: 'android', app: 'customer' });
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...alice.authHeader)
      .send({ token: token('new'), platform: 'android', app: 'customer' });

    await request(app)
      .post('/api/v1/notifications/devices/remove')
      .set(...alice.authHeader)
      .send({ token: token('old') });

    expect((await deviceOwners()).map((d) => d.token)).toEqual([token('new')]);
  });

  it('cannot remove somebody else device', async () => {
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...alice.authHeader)
      .send({ token: token('a'), platform: 'android', app: 'customer' });

    const response = await request(app)
      .post('/api/v1/notifications/devices/remove')
      .set(...bob.authHeader)
      .send({ token: token('a') });

    // Whatever it answers, Alice's device is still Alice's.
    expect(response.status).toBeLessThan(500);
    expect(await deviceOwners()).toEqual([
      { userId: 'alice', app: 'customer', token: token('a') },
    ]);
  });
});

describe('who a push reaches', () => {
  it('only the person it is about', async () => {
    const { sender, sent } = recordingSender();
    usePushSender(sender);

    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...alice.authHeader)
      .send({ token: token('alice'), platform: 'android', app: 'customer' });
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...bob.authHeader)
      .send({ token: token('bob'), platform: 'android', app: 'driver' });

    await notificationService.notifyCustomer({
      customerId: 'alice',
      orderId: 'order-1',
      kind: 'order_delivered',
      facts: { storeName: 'Mama Ntuli' },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.tokens).toEqual([token('alice')]);
  });

  it('goes to the app it belongs in', async () => {
    const { sender, sent } = recordingSender();
    usePushSender(sender);

    // One person, both apps on the same phone.
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...bob.authHeader)
      .send({ token: token('bobcustomer'), platform: 'android', app: 'customer' });
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...bob.authHeader)
      .send({ token: token('bobdriver'), platform: 'android', app: 'driver' });

    await notificationService.notifyDrivers({
      driverIds: ['bob'],
      orderId: 'order-1',
      kind: 'delivery_available',
      facts: { storeName: 'Mama Ntuli', driverEarnings: 12.75 },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.tokens).toEqual([token('bobdriver')]);
  });

  it('still reaches installs that predate the app field', async () => {
    const { sender, sent } = recordingSender();
    usePushSender(sender);

    // Written as an older build would have: no app recorded.
    await db
      .collection(Collections.deviceTokens)
      .doc('legacy')
      .set({ userId: 'alice', token: token('legacy'), platform: 'android' });

    await notificationService.notifyCustomer({
      customerId: 'alice',
      orderId: 'order-1',
      kind: 'order_delivered',
      facts: { storeName: 'Mama Ntuli' },
    });

    expect(sent[0]!.tokens).toEqual([token('legacy')]);
  });

  it('says nothing twice, however often the same moment is reported', async () => {
    const { sender, sent } = recordingSender();
    usePushSender(sender);

    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...alice.authHeader)
      .send({ token: token('alice'), platform: 'android', app: 'customer' });

    for (let i = 0; i < 3; i++) {
      await notificationService.notifyCustomer({
        customerId: 'alice',
        orderId: 'order-1',
        kind: 'order_delivered',
        facts: { storeName: 'Mama Ntuli' },
      });
    }

    expect(sent).toHaveLength(1);
  });
});

describe('what a client can read back', () => {
  it('the inbox, and no tokens anywhere in it', async () => {
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(...alice.authHeader)
      .send({ token: token('alice'), platform: 'android', app: 'customer' });

    await notificationService.notifyCustomer({
      customerId: 'alice',
      orderId: 'order-1',
      kind: 'order_delivered',
      facts: { storeName: 'Mama Ntuli' },
    });

    const response = await request(app)
      .get('/api/v1/notifications')
      .set(...alice.authHeader);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(token('alice'));
  });

  it('never another account notifications', async () => {
    await notificationService.notifyCustomer({
      customerId: 'alice',
      orderId: 'order-1',
      kind: 'order_delivered',
      facts: { storeName: 'Mama Ntuli' },
    });

    const response = await request(app)
      .get('/api/v1/notifications')
      .set(...bob.authHeader);

    expect(response.body.data).toEqual([]);
  });
});
