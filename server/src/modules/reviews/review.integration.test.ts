/**
 * Ratings for the kitchen and the driver.
 *
 * Everything a customer sees before ordering is written by the person selling
 * to them. A rating is the one part of a kitchen's page, and the whole of a
 * driver's record, that somebody else wrote - which is worth nothing unless
 * the somebody actually ate the food.
 *
 * Until now they were written straight from the browser, with the rules
 * letting any signed-in account create a review and move any kitchen's
 * average. These pin the replacement: an order you paid for, delivered, once.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
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

let app: Application;
let customer: TestAccount;
let other: TestAccount;
let storeId: string;
let orderId: string;

async function delivered(options: { driverId?: string | null } = {}) {
  const id = await seedOrder({
    customerId: 'cust-1',
    storeId,
    storeName: "Mini's Mashy Eatery",
    driverId: options.driverId === undefined ? 'drv-1' : options.driverId,
    status: 'delivered',
  });
  return id;
}

const review = (id: string, body: object, as: TestAccount = customer) =>
  request(app)
    .post(`/api/v1/reviews/orders/${id}`)
    .set(...as.authHeader)
    .send(body);

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [customer, other] = await Promise.all([
    createTestAccount({ uid: 'cust-1', role: 'customer' }),
    createTestAccount({ uid: 'cust-2', role: 'customer' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'cust-1', role: 'customer', displayName: 'Thabo Nkosi' }),
    seedUser({ uid: 'cust-2', role: 'customer' }),
    seedUser({ uid: 'vend-1', role: 'vendor' }),
    seedUser({ uid: 'drv-1', role: 'driver' }),
  ]);

  storeId = await seedStore({ ownerId: 'vend-1' });
  await db.collection(Collections.drivers).doc('drv-1').set({
    vehicleType: 'motorbike',
    idNumber: '9203145800084',
    status: 'approved',
    createdAt: new Date(),
  });

  orderId = await delivered();
});

describe('leaving a review', () => {
  it('records the stars, the words and who said them', async () => {
    const response = await review(orderId, {
      store: { rating: 5, comment: 'The kota was enormous.' },
    });

    expect(response.status).toBe(201);
    expect(response.body.data[0]).toMatchObject({
      target: 'store',
      subjectId: storeId,
      rating: 5,
      comment: 'The kota was enormous.',
      customerName: 'Thabo Nkosi',
    });
  });

  it('moves the kitchen average', async () => {
    await review(orderId, { store: { rating: 4 } });
    const second = await delivered();
    await review(second, { store: { rating: 5 } });

    const store = await db.collection(Collections.stores).doc(storeId).get();
    expect(store.get('rating')).toBe(4.5);
    expect(store.get('reviewCount')).toBe(2);
  });

  it('moves the driver average, which nothing else could', async () => {
    await review(orderId, { driver: { rating: 5 } });

    const driver = await db.collection(Collections.drivers).doc('drv-1').get();
    expect(driver.get('rating')).toBe(5);
    expect(driver.get('ratingCount')).toBe(1);
  });

  it('takes both in one go', async () => {
    const response = await review(orderId, {
      store: { rating: 4 },
      driver: { rating: 3, comment: 'Took a while to find the gate.' },
    });

    expect(response.body.data).toHaveLength(2);
  });

  it('keeps the kitchen review when the order had no driver', async () => {
    // Rather than refusing the pair and losing what they typed.
    const noDriver = await delivered({ driverId: null });

    const response = await review(noDriver, {
      store: { rating: 5 },
      driver: { rating: 5 },
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toHaveLength(1);
  });

  it('shows up on the kitchen page for everyone', async () => {
    await review(orderId, { store: { rating: 5, comment: 'Lovely.' } });

    const response = await request(app).get(
      `/api/v1/reviews/stores/${storeId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data[0].comment).toBe('Lovely.');
  });

  it('and on the driver', async () => {
    await review(orderId, { driver: { rating: 4, comment: 'Quick.' } });

    const response = await request(app).get('/api/v1/reviews/drivers/drv-1');

    expect(response.body.data[0].comment).toBe('Quick.');
  });
});

describe('when only half of it can be saved', () => {
  it('keeps the kitchen review when the driver has no record', async () => {
    // Found by rating a real order: the kitchen's review was written, the
    // driver's threw because that driver had no document, and the whole
    // call came back as a failure - so the customer was told it had not
    // saved, and could never retry, because the half that saved collided.
    await db.collection(Collections.drivers).doc('drv-1').delete();

    const response = await review(orderId, {
      store: { rating: 5 },
      driver: { rating: 5 },
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].target).toBe('store');
  });

  it('lets the other half be sent afterwards', async () => {
    await review(orderId, { store: { rating: 5 } });

    const response = await review(orderId, { driver: { rating: 4 } });

    expect(response.status).toBe(201);
    expect(response.body.data[0].target).toBe('driver');
  });

  it('still refuses when nothing at all could be saved', async () => {
    await review(orderId, { store: { rating: 5 }, driver: { rating: 5 } });

    const again = await review(orderId, {
      store: { rating: 1 },
      driver: { rating: 1 },
    });

    expect(again.status).toBe(409);
  });
});

describe('what is refused', () => {
  it('somebody else order', async () => {
    const response = await review(orderId, { store: { rating: 1 } }, other);

    expect(response.status).toBe(404);
  });

  it('an order that has not arrived', async () => {
    const onTheWay = await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'picked_up',
    });

    const response = await review(onTheWay, { store: { rating: 5 } });

    expect(response.status).toBe(409);
  });

  it('the same order twice', async () => {
    await review(orderId, { store: { rating: 5 } });

    const again = await review(orderId, { store: { rating: 5 } });

    expect(again.status).toBe(409);

    const store = await db.collection(Collections.stores).doc(storeId).get();
    expect(store.get('reviewCount')).toBe(1);
  });

  it('six stars, and none at all', async () => {
    expect((await review(orderId, { store: { rating: 6 } })).status).toBe(422);
    expect((await review(orderId, { store: { rating: 0 } })).status).toBe(422);
    expect((await review(orderId, {})).status).toBe(422);
  });

  it('an essay', async () => {
    const response = await review(orderId, {
      store: { rating: 5, comment: 'x'.repeat(501) },
    });

    expect(response.status).toBe(422);
  });

  it('nobody signed out', async () => {
    const response = await request(app)
      .post(`/api/v1/reviews/orders/${orderId}`)
      .send({ store: { rating: 5 } });

    expect(response.status).toBe(401);
  });
});

describe('asking once', () => {
  it('the app can see what has already been said', async () => {
    await review(orderId, { store: { rating: 5 } });

    const response = await request(app)
      .get(`/api/v1/reviews/orders/${orderId}`)
      .set(...customer.authHeader);

    expect(response.body.data.map((r: { target: string }) => r.target)).toEqual([
      'store',
    ]);
  });

  it('and nobody else can', async () => {
    const response = await request(app)
      .get(`/api/v1/reviews/orders/${orderId}`)
      .set(...other.authHeader);

    expect(response.status).toBe(404);
  });
});
