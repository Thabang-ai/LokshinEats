/**
 * Whether LokshinEats has let a kitchen trade.
 *
 * Until now a kitchen was on the platform the moment somebody filled in a
 * form. Nobody checked that the business existed, that the address was real,
 * or that a person had looked at it at all - while a driver carrying one
 * order had been through a review since October.
 *
 * The one that matters most here is the grandfathering: every kitchen
 * trading today was registered before this existed and carries no
 * verification field. Reading that absence as "pending" would have closed
 * the whole platform on deploy.
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
let admin: TestAccount;
let vendor: TestAccount;
let customer: TestAccount;

const validStore = {
  name: 'Mama Ntuli Kota Corner',
  cuisine: 'Kota Specialist',
  address: '12 Vilakazi Street',
  city: 'Soweto',
};

/** A kitchen as the review queue will find it. */
async function kitchen(verification?: string): Promise<string> {
  // A kitchen with no status is only grandfathered in if it predates the day
  // client writes were closed, so a legacy document has to look legacy.
  const storeId = await seedStore({
    ownerId: 'vend-1',
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
  });

  if (verification !== undefined) {
    await db
      .collection(Collections.stores)
      .doc(storeId)
      .update({ verification });
  } else {
    // A kitchen that predates the queue: no field at all.
    await db
      .collection(Collections.stores)
      .doc(storeId)
      .update({ verification: FieldValue.delete() });
  }
  return storeId;
}

const decide = (
  storeId: string,
  body: object,
  as: TestAccount = admin,
) =>
  request(app)
    .post(`/api/v1/stores/${storeId}/verification`)
    .set(...as.authHeader)
    .send(body);

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [admin, vendor, customer] = await Promise.all([
    createTestAccount({ uid: 'admin-1', role: 'admin' }),
    createTestAccount({ uid: 'vend-1', role: 'vendor' }),
    createTestAccount({ uid: 'cust-1', role: 'customer' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'admin-1', role: 'admin' }),
    seedUser({ uid: 'vend-1', role: 'vendor' }),
    seedUser({ uid: 'cust-1', role: 'customer' }),
  ]);
});

describe('kitchens that were already trading', () => {
  it('keep trading, field or no field', async () => {
    // The whole platform, on the morning this deployed.
    const storeId = await kitchen();

    const response = await request(app).get(`/api/v1/stores/${storeId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.verification).toBe('approved');
  });

  it('and still appear in the list a customer browses', async () => {
    await kitchen();

    const response = await request(app).get('/api/v1/stores');

    expect(response.body.data).toHaveLength(1);
  });
});

describe('a kitchen nobody has approved yet', () => {
  it('starts in the queue when it registers', async () => {
    const response = await request(app)
      .post('/api/v1/stores')
      .set(...vendor.authHeader)
      .send(validStore);

    expect(response.status).toBe(201);
    expect(response.body.data.verification).toBe('pending');
    expect(response.body.data.isOpen).toBe(false);
  });

  it('is not in the list a customer browses', async () => {
    await kitchen('pending');

    const response = await request(app).get('/api/v1/stores');

    expect(response.body.data).toEqual([]);
  });

  it('is missing rather than refused, asked for directly', async () => {
    // Whether an unapproved kitchen exists is not a customer's business.
    const storeId = await kitchen('pending');

    expect((await request(app).get(`/api/v1/stores/${storeId}`)).status).toBe(
      404,
    );
  });

  it('cannot be opened by its own vendor', async () => {
    await kitchen('pending');

    const response = await request(app)
      .patch('/api/v1/stores/mine')
      .set(...vendor.authHeader)
      .send({ isOpen: true });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/still checking/i);
  });

  it('can still be worked on while it waits', async () => {
    // A vendor filling in their menu and fixing their address is not a
    // vendor trading, and making them wait to do it helps nobody.
    await kitchen('pending');

    const response = await request(app)
      .patch('/api/v1/stores/mine')
      .set(...vendor.authHeader)
      .send({ address: '14 Vilakazi Street' });

    expect(response.status).toBe(200);
  });

  it('takes no orders', async () => {
    const storeId = await kitchen('pending');
    const productId = await seedProduct({ storeId, price: 45 });
    await db
      .collection(Collections.stores)
      .doc(storeId)
      .update({ isOpen: true, verification: 'pending' });

    const response = await request(app)
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

    expect(response.status).toBe(404);
  });
});

describe('the decision', () => {
  it('lets an approved kitchen open and be ordered from', async () => {
    const storeId = await kitchen('pending');

    expect((await decide(storeId, { decision: 'approve' })).status).toBe(200);

    const opened = await request(app)
      .patch('/api/v1/stores/mine')
      .set(...vendor.authHeader)
      .send({ isOpen: true });

    expect(opened.status).toBe(200);
    expect((await request(app).get('/api/v1/stores')).body.data).toHaveLength(1);
  });

  it('closes a kitchen it turns down, there and then', async () => {
    // It may have been open and cooking when the decision came.
    const storeId = await kitchen('approved');
    await db.collection(Collections.stores).doc(storeId).update({ isOpen: true });

    await decide(storeId, {
      decision: 'reject',
      reason: 'The address is a vacant lot.',
    });

    const store = await db.collection(Collections.stores).doc(storeId).get();
    expect(store.get('isOpen')).toBe(false);
    expect(store.get('verification')).toBe('rejected');
  });

  it('tells the vendor why, in the words the admin used', async () => {
    const storeId = await kitchen('pending');
    await decide(storeId, {
      decision: 'reject',
      reason: 'The address is a vacant lot.',
    });

    const mine = await request(app)
      .get('/api/v1/stores/mine')
      .set(...vendor.authHeader);

    expect(mine.body.data.verificationReason).toBe(
      'The address is a vacant lot.',
    );

    const reopen = await request(app)
      .patch('/api/v1/stores/mine')
      .set(...vendor.authHeader)
      .send({ isOpen: true });
    expect(reopen.body.error.message).toBe('The address is a vacant lot.');
  });

  it('refuses a rejection that says nothing', async () => {
    const storeId = await kitchen('pending');

    expect((await decide(storeId, { decision: 'reject' })).status).toBe(422);
  });

  it('records who decided it', async () => {
    const storeId = await kitchen('pending');
    await decide(storeId, { decision: 'approve' });

    const store = await db.collection(Collections.stores).doc(storeId).get();
    expect(store.get('verifiedBy')).toBe('admin-1');
    expect(store.get('verifiedAt')).toBeTruthy();
  });
});

describe('the queue', () => {
  it('lists what is waiting', async () => {
    await kitchen('pending');

    const response = await request(app)
      .get('/api/v1/stores/review?status=pending')
      .set(...admin.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('counts a grandfathered kitchen as approved', async () => {
    await kitchen();

    const approved = await request(app)
      .get('/api/v1/stores/review?status=approved')
      .set(...admin.authHeader);

    expect(approved.body.data).toHaveLength(1);
  });

  it('is not for a vendor to read', async () => {
    expect(
      (await request(app).get('/api/v1/stores/review').set(...vendor.authHeader))
        .status,
    ).toBe(403);
  });

  it('and a vendor cannot approve their own kitchen', async () => {
    const storeId = await kitchen('pending');

    expect((await decide(storeId, { decision: 'approve' }, vendor)).status).toBe(
      403,
    );
  });
});
