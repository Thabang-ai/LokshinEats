/**
 * Opening hours that open and close a kitchen.
 *
 * The hours have been on the registration form since the first day and have
 * never once stopped an order: a kitchen whose hours said 08:00-18:00 sat
 * "open" at three in the morning, took the order, and left a customer
 * waiting for food nobody was cooking.
 *
 * Two things are being protected here. The first is that turning the hours
 * on is the vendor's own choice - every kitchen trading today has hours
 * filled in and no `hoursMode` field, and reading that absence as "closed"
 * would have shut the platform on deploy. The second is that the switch
 * still wins: a kitchen inside its hours that has closed by hand stays
 * closed.
 *
 * The windows below are built around the real clock rather than a fixed
 * time, because the API reads the real clock. Everything is SAST (UTC+2).
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
  seedProduct,
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
let vendor: TestAccount;
let customer: TestAccount;

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

/** "HH:MM" in SAST, so many minutes from now. */
function sastTime(offsetMinutes: number): string {
  const at = new Date(Date.now() + SAST_OFFSET_MS + offsetMinutes * 60_000);
  return [at.getUTCHours(), at.getUTCMinutes()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

/** Hours that are open at this moment. */
const openNow = { openingTime: sastTime(-120), closingTime: sastTime(120) };

/** Hours that are shut at this moment, and open again in an hour. */
const shutNow = { openingTime: sastTime(60), closingTime: sastTime(180) };

/**
 * Hours that run past midnight and are open now: everything except the hour
 * starting in an hour's time. 18:00 to 02:00 is a normal Friday.
 */
const pastMidnight = { openingTime: sastTime(120), closingTime: sastTime(60) };

/**
 * A kitchen with hours on it.
 *
 * `mode` left out writes no `hoursMode` field at all, which is every kitchen
 * that existed before this.
 */
async function kitchen(
  hours: { openingTime: string; closingTime: string },
  mode?: 'manual' | 'scheduled',
  isOpen = true,
): Promise<string> {
  const storeId = await seedStore({ ownerId: 'vend-1', isOpen });

  await db
    .collection(Collections.stores)
    .doc(storeId)
    .update({
      ...hours,
      hoursMode: mode ?? FieldValue.delete(),
    });

  return storeId;
}

/** A customer trying to buy something from it. */
async function order(storeId: string) {
  const productId = await seedProduct({ storeId, price: 45 });

  return request(app)
    .post('/api/v1/orders')
    .set(...customer.authHeader)
    .send({
      storeId,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: {
        street: '1 Vilakazi Street',
        city: 'Soweto',
        postalCode: '1804',
      },
      paymentMethod: 'cash',
      customerPhone: '0821234567',
      cashAmount: 200,
    });
}

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [vendor, customer] = await Promise.all([
    createTestAccount({ uid: 'vend-1', role: 'vendor' }),
    createTestAccount({ uid: 'cust-1', role: 'customer' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'vend-1', role: 'vendor' }),
    seedUser({ uid: 'cust-1', role: 'customer' }),
  ]);
});

describe('kitchens that never turned the hours on', () => {
  it('trade at any hour, hours filled in or not', async () => {
    // The whole platform, on the morning this deployed: hours on the
    // document, no hoursMode field, and customers ordering right now.
    const storeId = await kitchen(shutNow);

    expect((await request(app).get(`/api/v1/stores/${storeId}`)).body.data.isOpen).toBe(
      true,
    );
    expect((await order(storeId)).status).toBe(201);
  });

  it('and are still in the list of kitchens open now', async () => {
    await kitchen(shutNow);

    const response = await request(app).get('/api/v1/stores?openOnly=true');

    expect(response.body.data).toHaveLength(1);
  });
});

describe('a kitchen on scheduled hours', () => {
  it('takes orders inside its hours', async () => {
    const storeId = await kitchen(openNow, 'scheduled');

    expect((await order(storeId)).status).toBe(201);
  });

  it('refuses them outside its hours', async () => {
    const storeId = await kitchen(shutNow, 'scheduled');

    const response = await order(storeId);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/not accepting orders/i);
  });

  it('drops out of the list of kitchens open now', async () => {
    await kitchen(shutNow, 'scheduled');

    expect((await request(app).get('/api/v1/stores?openOnly=true')).body.data).toEqual(
      [],
    );
  });

  it('is still there when a customer browses, marked closed', async () => {
    // Hiding it would be worse: a customer looking for their regular kitchen
    // needs to see that it opens later, not that it has vanished.
    await kitchen(shutNow, 'scheduled');

    const response = await request(app).get('/api/v1/stores');

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].isOpen).toBe(false);
  });

  it('trades through midnight when its closing time is the earlier one', async () => {
    const storeId = await kitchen(pastMidnight, 'scheduled');

    expect((await order(storeId)).status).toBe(201);
  });
});

describe('the switch still beats the clock', () => {
  it('a kitchen closed by hand stays closed inside its hours', async () => {
    const storeId = await kitchen(openNow, 'scheduled', false);

    expect((await order(storeId)).status).toBe(409);
  });

  it('and the vendor sees their own setting, not the answer', async () => {
    // The vendor app shows the switch as they left it and says "Shut for
    // now" beside it. A switch that flicked itself off at closing time
    // would look broken.
    await kitchen(shutNow, 'scheduled');

    const mine = await request(app)
      .get('/api/v1/stores/mine')
      .set(...vendor.authHeader);

    expect(mine.body.data.isOpen).toBe(false);
    expect(mine.body.data.switchedOn).toBe(true);
    expect(mine.body.data.hoursMode).toBe('scheduled');
  });
});

describe('turning the hours on', () => {
  it('closes the kitchen from that moment, without touching the switch', async () => {
    const storeId = await kitchen(shutNow);

    const response = await request(app)
      .patch('/api/v1/stores/mine')
      .set(...vendor.authHeader)
      .send({ hoursMode: 'scheduled' });

    expect(response.status).toBe(200);
    expect(response.body.data.isOpen).toBe(false);
    expect(response.body.data.switchedOn).toBe(true);
    expect((await order(storeId)).status).toBe(409);
  });

  it('and turning them off hands the kitchen back to the switch', async () => {
    const storeId = await kitchen(shutNow, 'scheduled');

    await request(app)
      .patch('/api/v1/stores/mine')
      .set(...vendor.authHeader)
      .send({ hoursMode: 'manual' });

    expect((await order(storeId)).status).toBe(201);
  });

  it('refuses hours that are not times', async () => {
    await kitchen(openNow, 'scheduled');

    const response = await request(app)
      .patch('/api/v1/stores/mine')
      .set(...vendor.authHeader)
      .send({ openingTime: 'morning' });

    expect(response.status).toBe(422);
  });
});
