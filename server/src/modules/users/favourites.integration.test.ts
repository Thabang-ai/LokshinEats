/**
 * Favourite kitchens, over HTTP.
 *
 * The field is `favorites` on the profile document, which the web app has
 * written directly since before this API existed. These check the two stay
 * interoperable: a favourite saved on the website is visible to the apps, and
 * one saved through the API is visible on the website.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { Collections, db } from '../../config/firebase';
import {
  assertEmulator,
  resetFirestore,
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
let storeId: string;
let otherStoreId: string;

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);
  customer = await createTestAccount({ uid: 'cust-1', role: 'customer' });
  await seedUser({ uid: 'cust-1', role: 'customer' });
  storeId = await seedStore({ ownerId: 'vend-1' });
  otherStoreId = await seedStore({ ownerId: 'vend-2' });
});

const favouritesOnDocument = async () =>
  (await db.collection(Collections.users).doc('cust-1').get()).get('favorites');

describe('favourite kitchens', () => {
  it('starts empty', async () => {
    const response = await request(app)
      .get('/api/v1/users/me/favorites')
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('saves one, and says what the list is now', async () => {
    const response = await request(app)
      .put(`/api/v1/users/me/favorites/${storeId}`)
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([storeId]);
    // Written where the website reads it.
    expect(await favouritesOnDocument()).toEqual([storeId]);
  });

  it('favouriting twice leaves one entry', async () => {
    // A heart can be tapped faster than the network answers.
    await request(app)
      .put(`/api/v1/users/me/favorites/${storeId}`)
      .set(...customer.authHeader);
    const response = await request(app)
      .put(`/api/v1/users/me/favorites/${storeId}`)
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([storeId]);
  });

  it('removes one and leaves the rest alone', async () => {
    await request(app)
      .put(`/api/v1/users/me/favorites/${storeId}`)
      .set(...customer.authHeader);
    await request(app)
      .put(`/api/v1/users/me/favorites/${otherStoreId}`)
      .set(...customer.authHeader);

    const response = await request(app)
      .delete(`/api/v1/users/me/favorites/${storeId}`)
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([otherStoreId]);
  });

  it('un-favouriting something that was never there is fine', async () => {
    const response = await request(app)
      .delete(`/api/v1/users/me/favorites/${storeId}`)
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('reads favourites the website saved', async () => {
    await db
      .collection(Collections.users)
      .doc('cust-1')
      .set({ favorites: [storeId] }, { merge: true });

    const response = await request(app)
      .get('/api/v1/users/me/favorites')
      .set(...customer.authHeader);

    expect(response.body.data).toEqual([storeId]);
  });

  it('refuses a kitchen that does not exist', async () => {
    // Otherwise a stale id from an app left open for a week becomes a
    // permanent entry pointing at nothing.
    const response = await request(app)
      .put('/api/v1/users/me/favorites/no-such-store')
      .set(...customer.authHeader);

    expect(response.status).toBe(404);
  });

  it('is nobody else business: no token, no favourites', async () => {
    const response = await request(app).get('/api/v1/users/me/favorites');
    expect(response.status).toBe(401);
  });
});
