/**
 * Store and product routes over HTTP, with real Firebase ID tokens.
 *
 * The model tests prove the schemas refuse an `ownerId` or a `storeId`. These
 * prove the routes derive those from the caller instead — which is the half
 * that decides whether one vendor can edit another's menu.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import {
  assertEmulator,
  resetFirestore,
  seedProduct,
  seedStore,
  seedUser,
} from '../../test/support';
import {
  assertAuthEmulator,
  bearer,
  createTestAccount,
  resetAuth,
  signIn,
  type TestAccount,
} from '../../test/auth';

let app: Application;

let customer: TestAccount;
let vendor: TestAccount;
let otherVendor: TestAccount;
let admin: TestAccount;

const validStore = {
  name: 'Kota Corner',
  cuisine: 'Kota Specialist',
  address: '12 Vilakazi Street',
  city: 'Soweto',
};

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [customer, vendor, otherVendor, admin] = await Promise.all([
    createTestAccount({ uid: 'cust-1', role: 'customer' }),
    createTestAccount({ uid: 'vend-1', role: 'vendor' }),
    createTestAccount({ uid: 'vend-2', role: 'vendor' }),
    createTestAccount({ uid: 'admin-1', role: 'admin' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'cust-1', role: 'customer' }),
    seedUser({ uid: 'vend-1', role: 'vendor' }),
    seedUser({ uid: 'vend-2', role: 'vendor' }),
    seedUser({ uid: 'admin-1', role: 'admin' }),
  ]);
});

describe('public browsing', () => {
  it('lists stores without a token', async () => {
    await seedStore({ ownerId: 'vend-1', name: 'Kota Corner' });

    // Customers compare stores before signing in.
    const response = await request(app).get('/api/v1/stores');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('lists a menu without a token', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    await seedProduct({ storeId, price: 45.5 });

    const response = await request(app).get(
      `/api/v1/products?storeId=${storeId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('filters stores to those currently open', async () => {
    await seedStore({ ownerId: 'vend-1', name: 'Open Store', isOpen: true });
    await seedStore({ ownerId: 'vend-2', name: 'Closed Store', isOpen: false });

    const response = await request(app).get('/api/v1/stores?openOnly=true');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Open Store');
  });

  it('reports an unknown store as missing', async () => {
    const response = await request(app).get('/api/v1/stores/nope');
    expect(response.status).toBe(404);
  });
});

describe('registering a store', () => {
  it('promotes the account to vendor and says the token is stale', async () => {
    const response = await request(app)
      .post('/api/v1/stores')
      .set(...customer.authHeader)
      .send(validStore);

    expect(response.status).toBe(201);
    expect(response.body.data.ownerId).toBe('cust-1');
    expect(response.body.meta.tokenRefreshRequired).toBe(true);

    // The claim really changed: a fresh token reaches a vendor-only route
    // that the original token could not.
    const refreshed = await signIn(customer.email);
    const asVendor = await request(app)
      .get('/api/v1/stores/mine')
      .set(...bearer(refreshed));

    expect(asVendor.status).toBe(200);
    expect(asVendor.body.data.name).toBe('Kota Corner');
  });

  it('opens the store closed, so the vendor chooses when to trade', async () => {
    const response = await request(app)
      .post('/api/v1/stores')
      .set(...customer.authHeader)
      .send(validStore);

    expect(response.body.data.isOpen).toBe(false);
  });

  it('ignores nothing — a claimed ownerId is rejected outright', async () => {
    const response = await request(app)
      .post('/api/v1/stores')
      .set(...customer.authHeader)
      .send({ ...validStore, ownerId: 'vend-1' });

    expect(response.status).toBe(422);
  });

  it('refuses a self-assigned rating', async () => {
    const response = await request(app)
      .post('/api/v1/stores')
      .set(...customer.authHeader)
      .send({ ...validStore, rating: 5, reviewCount: 400 });

    expect(response.status).toBe(422);
  });

  it('seeds the rating at zero', async () => {
    const response = await request(app)
      .post('/api/v1/stores')
      .set(...customer.authHeader)
      .send(validStore);

    expect(response.body.data.rating).toBe(0);
    expect(response.body.data.reviewCount).toBe(0);
  });

  it('refuses a second store for the same account', async () => {
    await request(app)
      .post('/api/v1/stores')
      .set(...customer.authHeader)
      .send(validStore);

    const response = await request(app)
      .post('/api/v1/stores')
      .set(...customer.authHeader)
      .send({ ...validStore, name: 'Second Kitchen' });

    expect(response.status).toBe(409);
  });

  it('refuses an anonymous registration', async () => {
    const response = await request(app).post('/api/v1/stores').send(validStore);
    expect(response.status).toBe(401);
  });
});

describe('editing a store', () => {
  it('lets a vendor open and close their own store', async () => {
    await seedStore({ ownerId: 'vend-1', isOpen: false });

    const response = await request(app)
      .patch('/api/v1/stores/mine')
      .set(...vendor.authHeader)
      .send({ isOpen: true });

    expect(response.status).toBe(200);
    expect(response.body.data.isOpen).toBe(true);
  });

  it('edits the caller’s own store, whatever ids are lying around', async () => {
    const mine = await seedStore({ ownerId: 'vend-1', name: 'Mine' });
    const theirs = await seedStore({ ownerId: 'vend-2', name: 'Theirs' });

    await request(app)
      .patch('/api/v1/stores/mine')
      .set(...vendor.authHeader)
      .send({ name: 'Renamed' });

    // The route takes no store id at all, so there is nothing to point at
    // someone else's store.
    const mineAfter = await request(app).get(`/api/v1/stores/${mine}`);
    const theirsAfter = await request(app).get(`/api/v1/stores/${theirs}`);

    expect(mineAfter.body.data.name).toBe('Renamed');
    expect(theirsAfter.body.data.name).toBe('Theirs');
  });

  it('refuses to let a vendor use the admin edit route', async () => {
    const theirs = await seedStore({ ownerId: 'vend-2' });

    const response = await request(app)
      .patch(`/api/v1/stores/${theirs}`)
      .set(...vendor.authHeader)
      .send({ name: 'Hijacked' });

    expect(response.status).toBe(403);
  });

  it('lets an admin edit any store', async () => {
    const theirs = await seedStore({ ownerId: 'vend-2' });

    const response = await request(app)
      .patch(`/api/v1/stores/${theirs}`)
      .set(...admin.authHeader)
      .send({ name: 'Corrected Name' });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Corrected Name');
  });

  it('tells a vendor with no store that they have none', async () => {
    const response = await request(app)
      .get('/api/v1/stores/mine')
      .set(...vendor.authHeader);

    expect(response.status).toBe(404);
  });

  it('keeps a customer out of the vendor routes', async () => {
    const response = await request(app)
      .get('/api/v1/stores/mine')
      .set(...customer.authHeader);

    expect(response.status).toBe(403);
  });
});

describe('menu management', () => {
  it('files a new product under the caller’s own store', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });

    const response = await request(app)
      .post('/api/v1/products')
      .set(...vendor.authHeader)
      .send({ name: 'Full House Kota', price: 45.5, category: 'Kota' });

    expect(response.status).toBe(201);
    expect(response.body.data.storeId).toBe(storeId);
  });

  it('refuses a body that names a store', async () => {
    await seedStore({ ownerId: 'vend-1' });
    const theirs = await seedStore({ ownerId: 'vend-2' });

    const response = await request(app)
      .post('/api/v1/products')
      .set(...vendor.authHeader)
      .send({
        name: 'Planted Item',
        price: 10,
        category: 'Kota',
        storeId: theirs,
      });

    expect(response.status).toBe(422);
  });

  it('refuses a sub-cent price', async () => {
    await seedStore({ ownerId: 'vend-1' });

    const response = await request(app)
      .post('/api/v1/products')
      .set(...vendor.authHeader)
      .send({ name: 'Odd Price', price: 10.001, category: 'Kota' });

    expect(response.status).toBe(422);
    expect(response.body.error.details).toHaveProperty('price');
  });

  it('stops a vendor editing another vendor’s product', async () => {
    await seedStore({ ownerId: 'vend-1' });
    const theirStore = await seedStore({ ownerId: 'vend-2' });
    const theirProduct = await seedProduct({ storeId: theirStore, price: 50 });

    const response = await request(app)
      .patch(`/api/v1/products/${theirProduct}`)
      .set(...vendor.authHeader)
      .send({ price: 1 });

    // 404 rather than 403, so an id cannot be probed to learn it exists.
    expect(response.status).toBe(404);

    const unchanged = await request(app).get(
      `/api/v1/products/${theirProduct}`,
    );
    expect(unchanged.body.data.price).toBe(50);
  });

  it('stops a vendor deleting another vendor’s product', async () => {
    await seedStore({ ownerId: 'vend-1' });
    const theirStore = await seedStore({ ownerId: 'vend-2' });
    const theirProduct = await seedProduct({ storeId: theirStore, price: 50 });

    const response = await request(app)
      .delete(`/api/v1/products/${theirProduct}`)
      .set(...vendor.authHeader);

    expect(response.status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/products/${theirProduct}`)).status,
    ).toBe(200);
  });

  it('lets a vendor delete their own product', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    const productId = await seedProduct({ storeId, price: 50 });

    const response = await request(app)
      .delete(`/api/v1/products/${productId}`)
      .set(...vendor.authHeader);

    expect(response.status).toBe(204);
    expect(
      (await request(app).get(`/api/v1/products/${productId}`)).status,
    ).toBe(404);
  });

  it('keeps a customer from adding menu items', async () => {
    const response = await request(app)
      .post('/api/v1/products')
      .set(...customer.authHeader)
      .send({ name: 'Free Food', price: 0.01, category: 'Kota' });

    expect(response.status).toBe(403);
  });

  it('shows a vendor their own hidden items', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    await seedProduct({ storeId, price: 50, available: true, name: 'On Sale' });
    await seedProduct({
      storeId,
      price: 50,
      available: false,
      name: 'Sold Out',
    });

    const response = await request(app)
      .get('/api/v1/products/mine')
      .set(...vendor.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });
});
