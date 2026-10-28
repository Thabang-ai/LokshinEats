/**
 * Photographs of food, uploaded by the kitchen that cooks it.
 *
 * The vendor app and the website both had nowhere to put a photo: Firebase
 * Storage needs the Blaze plan and the project is on Spark, so the bucket
 * does not exist and the website's upload threw - taking the whole product
 * submission with it. These prove the replacement: bytes in Firestore,
 * served back by the API, and writable only by the kitchen that owns the
 * item.
 */

import { Buffer } from 'node:buffer';
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
  createTestAccount,
  resetAuth,
  type TestAccount,
} from '../../test/auth';
import { MAX_IMAGE_BYTES } from './image.model';

let app: Application;
let vendor: TestAccount;
let otherVendor: TestAccount;
let customer: TestAccount;
let storeId: string;
let productId: string;

/// A JPEG's first bytes, then filler: enough to be a distinguishable body.
function photo(size = 2048): Buffer {
  const bytes = Buffer.alloc(size, 7);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return bytes;
}

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [vendor, otherVendor, customer] = await Promise.all([
    createTestAccount({ uid: 'vend-1', role: 'vendor' }),
    createTestAccount({ uid: 'vend-2', role: 'vendor' }),
    createTestAccount({ uid: 'cust-1', role: 'customer' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'vend-1', role: 'vendor' }),
    seedUser({ uid: 'vend-2', role: 'vendor' }),
    seedUser({ uid: 'cust-1', role: 'customer' }),
  ]);

  storeId = await seedStore({ ownerId: 'vend-1' });
  productId = await seedProduct({ storeId, price: 45.5 });
});

describe('a kitchen photographing its own food', () => {
  it('accepts the photo and points the item at it', async () => {
    const response = await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...vendor.authHeader)
      .set('Content-Type', 'image/jpeg')
      .send(photo());

    expect(response.status).toBe(200);
    // Relative, and carrying a version, so the URL changes with the photo.
    expect(response.body.data.image).toMatch(
      new RegExp(`^/api/v1/products/${productId}/image\\?v=\\d+$`),
    );
  });

  it('serves it back to anyone, menus being public', async () => {
    const sent = photo();
    await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...vendor.authHeader)
      .set('Content-Type', 'image/jpeg')
      .send(sent);

    const response = await request(app).get(
      `/api/v1/products/${productId}/image`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(response.body, sent)).toBe(0);
  });

  it('lets it be cached for good, the URL being versioned', async () => {
    await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...vendor.authHeader)
      .set('Content-Type', 'image/jpeg')
      .send(photo());

    const response = await request(app).get(
      `/api/v1/products/${productId}/image`,
    );

    expect(response.headers['cache-control']).toContain('immutable');
  });

  it('a replacement gets a new URL, so phones do not show the old one', async () => {
    const first = await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...vendor.authHeader)
      .set('Content-Type', 'image/jpeg')
      .send(photo());

    // A second apart is not required; the version is the write's timestamp.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...vendor.authHeader)
      .set('Content-Type', 'image/png')
      .send(photo(3072));

    expect(second.body.data.image).not.toBe(first.body.data.image);

    const served = await request(app).get(
      `/api/v1/products/${productId}/image`,
    );
    expect(served.headers['content-type']).toContain('image/png');
    expect(served.body).toHaveLength(3072);
  });

  it('keeps the bytes out of the menu listing', async () => {
    // The whole reason photographs live in their own documents: a menu is
    // read on every store page, and nobody should pay for the pictures to
    // come with it.
    await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...vendor.authHeader)
      .set('Content-Type', 'image/jpeg')
      .send(photo(100 * 1024));

    const menu = await request(app).get(
      `/api/v1/products?storeId=${storeId}`,
    );

    expect(menu.status).toBe(200);
    expect(JSON.stringify(menu.body).length).toBeLessThan(2000);
  });
});

describe('what is refused', () => {
  it("another kitchen's item, as though it did not exist", async () => {
    const response = await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...otherVendor.authHeader)
      .set('Content-Type', 'image/jpeg')
      .send(photo());

    expect(response.status).toBe(404);
  });

  it('a customer, who owns no kitchen', async () => {
    const response = await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...customer.authHeader)
      .set('Content-Type', 'image/jpeg')
      .send(photo());

    expect(response.status).toBe(403);
  });

  it('nobody at all', async () => {
    const response = await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set('Content-Type', 'image/jpeg')
      .send(photo());

    expect(response.status).toBe(401);
  });

  it('a PDF dressed as a photograph', async () => {
    const response = await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...vendor.authHeader)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.7'));

    expect(response.status).toBe(400);
  });

  it('a photo too big for the document it has to fit in', async () => {
    const response = await request(app)
      .put(`/api/v1/products/${productId}/image`)
      .set(...vendor.authHeader)
      .set('Content-Type', 'image/jpeg')
      .send(photo(MAX_IMAGE_BYTES + 1024));

    expect(response.status).toBe(413);
  });

  it('an item with no photograph yet', async () => {
    const response = await request(app).get(
      `/api/v1/products/${productId}/image`,
    );

    expect(response.status).toBe(404);
  });
});
