/**
 * On the road, or not.
 *
 * Every approved driver was treated as available every hour of every day:
 * the board showed them work at two in the morning and a push notification
 * went to every driver on the platform for every order. An app that buzzes
 * somebody who has finished for the night is an app they turn off, and then
 * they miss the deliveries they did want.
 *
 * The grandfathering is the usual one and matters as much as ever: every
 * driver approved before this switch existed has no `isOnline` field, and
 * reading that absence as "off" would have taken the whole fleet off the
 * road on deploy.
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
  seedApprovedDriver,
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
let driver: TestAccount;
let admin: TestAccount;
let storeId: string;

const setOnline = (online: boolean, as: TestAccount = driver) =>
  request(app)
    .patch('/api/v1/drivers/me/availability')
    .set(...as.authHeader)
    .send({ online });

const board = (as: TestAccount = driver) =>
  request(app)
    .get('/api/v1/orders/available')
    .set(...as.authHeader);

/** A delivery sitting on the board, waiting for somebody to take it. */
async function claimableOrder(): Promise<string> {
  return seedOrder({
    customerId: 'cust-1',
    storeId,
    status: 'ready',
    driverId: null,
  });
}

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [driver, admin] = await Promise.all([
    createTestAccount({ uid: 'drv-1', role: 'driver' }),
    createTestAccount({ uid: 'admin-1', role: 'admin' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'drv-1', role: 'driver' }),
    seedUser({ uid: 'admin-1', role: 'admin' }),
    seedUser({ uid: 'cust-1', role: 'customer' }),
    seedUser({ uid: 'vend-1', role: 'vendor' }),
  ]);

  await seedApprovedDriver('drv-1');
  storeId = await seedStore({ ownerId: 'vend-1' });
});

describe('a driver who has never touched the switch', () => {
  it('is on the road', async () => {
    const mine = await request(app)
      .get('/api/v1/drivers/me')
      .set(...driver.authHeader);

    expect(mine.body.data.isOnline).toBe(true);
  });

  it('even with no field on the document at all', async () => {
    // Every driver on the platform, the morning this deploys.
    await db
      .collection(Collections.drivers)
      .doc('drv-1')
      .update({ isOnline: FieldValue.delete() });

    await claimableOrder();

    expect((await board()).body.data).toHaveLength(1);
  });
});

describe('going off the road', () => {
  beforeEach(async () => {
    await claimableOrder();
    expect((await setOnline(false)).status).toBe(200);
  });

  it('empties the board rather than showing work they cannot take', async () => {
    const response = await board();

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('refuses a delivery claimed anyway', async () => {
    // Reachable without the board: a notification from before they stopped,
    // or the app open on a second phone.
    const orderId = await claimableOrder();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/off the road/i);
  });

  it('does not hide the board from an admin looking at it', async () => {
    // The same endpoint answers an operator, who is not the one being
    // offered the work.
    expect((await board(admin)).body.data).toHaveLength(1);
  });

  it('and coming back on puts the work in front of them again', async () => {
    expect((await setOnline(true)).body.data.isOnline).toBe(true);
    expect((await board()).body.data).toHaveLength(1);
  });
});

describe('the switch itself', () => {
  it('records when it was last flipped', async () => {
    const response = await setOnline(false);

    expect(response.body.data).toMatchObject({ isOnline: false });
    expect(response.body.data.onlineChangedAt).toBeTruthy();
  });

  it('is not for somebody who has not applied to drive', async () => {
    const applicant = await createTestAccount({
      uid: 'cust-9',
      role: 'customer',
    });
    await seedUser({ uid: 'cust-9', role: 'customer' });

    expect((await setOnline(true, applicant)).status).toBe(403);
  });

  it('is not for a driver whose application is still being checked', async () => {
    await db
      .collection(Collections.drivers)
      .doc('drv-1')
      .update({ status: 'pending' });

    const response = await setOnline(true);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/still being checked/i);
  });

  it('refuses anything that is not yes or no', async () => {
    const response = await request(app)
      .patch('/api/v1/drivers/me/availability')
      .set(...driver.authHeader)
      .send({ online: 'maybe' });

    expect(response.status).toBe(422);
  });
});

describe('a delivery already in hand', () => {
  it('is not taken away by going off the road', async () => {
    // Somebody carrying a customer's dinner finishes it. The switch is about
    // what they are offered next.
    const orderId = await claimableOrder();

    await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader)
      .expect(200);

    await setOnline(false);

    const mine = await request(app)
      .get('/api/v1/orders/assigned')
      .set(...driver.authHeader);

    expect(mine.body.data).toHaveLength(1);
  });
});
