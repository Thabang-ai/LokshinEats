/**
 * Delivery areas, end to end.
 *
 * A kitchen in Meadowlands could be ordered from in Tembisa, 40km away. The
 * order went through, the kitchen cooked it, and then somebody had to phone
 * a customer and explain. Drivers were offered runs nobody would take.
 *
 * The two things being protected here are the same two as the hours: a
 * kitchen that has never heard of this keeps trading exactly as before, and
 * what the customer is told matches what the API will actually do.
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

/**
 * A kitchen in Meadowlands.
 *
 * `areas` left out writes no field at all, which is every kitchen that
 * existed before delivery areas did.
 */
async function kitchen(areas?: string[]): Promise<string> {
  const storeId = await seedStore({ ownerId: 'vend-1', name: 'Mama Ntuli' });

  await db
    .collection(Collections.stores)
    .doc(storeId)
    .update({
      city: 'Meadowlands',
      deliveryAreas: areas ?? FieldValue.delete(),
    });

  return storeId;
}

/** A customer in `city` trying to buy something. */
async function order(storeId: string, city: string) {
  const productId = await seedProduct({ storeId, price: 45 });

  return request(app)
    .post('/api/v1/orders')
    .set(...customer.authHeader)
    .send({
      storeId,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: { street: '1 Khozi Street', city, postalCode: '1804' },
      paymentMethod: 'cash',
      customerPhone: '0821234567',
      cashAmount: 200,
    });
}

const patch = (body: object) =>
  request(app)
    .patch('/api/v1/stores/mine')
    .set(...vendor.authHeader)
    .send(body);

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

describe('a kitchen that has never heard of delivery areas', () => {
  it('still delivers anywhere', async () => {
    const storeId = await kitchen();

    expect((await order(storeId, 'Tembisa')).status).toBe(201);
  });

  it('and is listed for a customer anywhere', async () => {
    await kitchen();

    const response = await request(app).get(
      '/api/v1/stores?deliversTo=Tembisa',
    );

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].deliveryAreas).toEqual([]);
  });
});

describe('a kitchen that has said where it delivers', () => {
  it('takes the order from an area on its list', async () => {
    const storeId = await kitchen(['Dobsonville']);

    expect((await order(storeId, 'Dobsonville')).status).toBe(201);
  });

  it('refuses one from outside, and says where it does deliver', async () => {
    const storeId = await kitchen(['Dobsonville']);

    const response = await order(storeId, 'Tembisa');

    expect(response.status).toBe(422);
    expect(response.body.error.message).toBe(
      'Mama Ntuli delivers to Meadowlands and Dobsonville, not Tembisa.',
    );
  });

  it('still delivers in its own township, listed or not', async () => {
    // A kitchen that named the township next door and forgot its own has
    // forgotten, not decided to stop serving its neighbours.
    const storeId = await kitchen(['Dobsonville']);

    expect((await order(storeId, 'Meadowlands')).status).toBe(201);
  });

  it('serves its own city on the list, so the vendor can see it', async () => {
    const storeId = await kitchen(['Dobsonville']);

    const response = await request(app).get(`/api/v1/stores/${storeId}`);

    expect(response.body.data.deliveryAreas).toEqual([
      'Meadowlands',
      'Dobsonville',
    ]);
  });

  it('is left out of the list for a customer it will not reach', async () => {
    await kitchen(['Dobsonville']);

    expect(
      (await request(app).get('/api/v1/stores?deliversTo=Tembisa')).body.data,
    ).toEqual([]);
  });

  it('and found by a customer it will', async () => {
    await kitchen(['Dobsonville']);

    expect(
      (await request(app).get('/api/v1/stores?deliversTo=dobsonville')).body
        .data,
    ).toHaveLength(1);
  });

  it('is still there when a customer browses everything', async () => {
    // Being out of range is not being shut down: a customer browsing with no
    // address yet should see the kitchen and be told at the address, not have
    // it quietly disappear.
    await kitchen(['Dobsonville']);

    expect((await request(app).get('/api/v1/stores')).body.data).toHaveLength(1);
  });
});

describe('a vendor setting their own areas', () => {
  it('saves them, their own city included', async () => {
    await kitchen();

    const response = await patch({ deliveryAreas: ['Dobsonville', 'Soweto'] });

    expect(response.status).toBe(200);
    expect(response.body.data.deliveryAreas).toEqual([
      'Meadowlands',
      'Dobsonville',
      'Soweto',
    ]);
  });

  it('drops an area they typed twice rather than refusing the save', async () => {
    await kitchen();

    const response = await patch({
      deliveryAreas: ['Dobsonville', ' dobsonville '],
    });

    expect(response.body.data.deliveryAreas).toEqual([
      'Meadowlands',
      'Dobsonville',
    ]);
  });

  it('lifts the limit again with an empty list', async () => {
    const storeId = await kitchen(['Dobsonville']);

    expect((await patch({ deliveryAreas: [] })).body.data.deliveryAreas).toEqual(
      [],
    );
    expect((await order(storeId, 'Tembisa')).status).toBe(201);
  });

  it('refuses an area with no name in it', async () => {
    await kitchen();

    expect((await patch({ deliveryAreas: ['Dobsonville', ' '] })).status).toBe(
      422,
    );
  });

  it('refuses more areas than a kitchen could cover', async () => {
    await kitchen();

    const areas = Array.from({ length: 21 }, (_, index) => `Area ${index}`);

    expect((await patch({ deliveryAreas: areas })).status).toBe(422);
  });

  it('cannot set them on anybody else’s kitchen', async () => {
    // Nothing here takes a store id from the request; this is the proof.
    const other = await createTestAccount({ uid: 'vend-2', role: 'vendor' });
    await seedUser({ uid: 'vend-2', role: 'vendor' });
    await kitchen(['Dobsonville']);

    const response = await request(app)
      .patch('/api/v1/stores/mine')
      .set(...other.authHeader)
      .send({ deliveryAreas: ['Tembisa'] });

    expect(response.status).toBe(404);
  });
});
