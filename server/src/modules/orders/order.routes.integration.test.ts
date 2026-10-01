/**
 * Order routes over HTTP, with real Firebase ID tokens.
 *
 * The serialiser unit tests prove `toOrder` hides the delivery code from a
 * driver. These prove the route actually asks for the driver's view — which
 * is a different claim, and the one that would have leaked the code if a
 * handler passed the wrong audience.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import {
  assertEmulator,
  resetFirestore,
  seedOrder,
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

let customer: TestAccount;
let vendor: TestAccount;
let otherVendor: TestAccount;
let driver: TestAccount;
let otherDriver: TestAccount;
let admin: TestAccount;

let storeId: string;
let productId: string;

const address = {
  street: '12 Vilakazi Street',
  city: 'Soweto',
  postalCode: '1804',
};

/** A valid order body, so each test only states what it changes. */
function orderBody(overrides: Record<string, unknown> = {}) {
  return {
    storeId,
    items: [{ productId, quantity: 2 }],
    deliveryAddress: address,
    paymentMethod: 'cash',
    customerPhone: '0821234567',
    ...overrides,
  };
}

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [customer, vendor, otherVendor, driver, otherDriver, admin] =
    await Promise.all([
      createTestAccount({ uid: 'cust-1', role: 'customer' }),
      createTestAccount({ uid: 'vend-1', role: 'vendor' }),
      createTestAccount({ uid: 'vend-2', role: 'vendor' }),
      createTestAccount({ uid: 'drv-1', role: 'driver' }),
      createTestAccount({ uid: 'drv-2', role: 'driver' }),
      createTestAccount({ uid: 'admin-1', role: 'admin' }),
    ]);

  await Promise.all([
    seedUser({ uid: 'cust-1', role: 'customer', displayName: 'Thabo' }),
    seedUser({ uid: 'vend-1', role: 'vendor' }),
    seedUser({ uid: 'drv-1', role: 'driver' }),
    seedUser({ uid: 'admin-1', role: 'admin' }),
  ]);

  storeId = await seedStore({ ownerId: 'vend-1', deliveryFee: 20 });
  productId = await seedProduct({ storeId, price: 45.5 });
});

describe('placing an order', () => {
  it('prices the order server-side', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set(...customer.authHeader)
      .send(orderBody());

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      subtotal: 91,
      deliveryFee: 20,
      total: 111,
      status: 'pending',
      paymentStatus: 'pending',
    });
  });

  it('rejects a body that names its own total', async () => {
    // The exact shape the old browser checkout sent.
    const response = await request(app)
      .post('/api/v1/orders')
      .set(...customer.authHeader)
      .send(orderBody({ total: 5, subtotal: 5, vendorPayout: 0 }));

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('rejects a body that declares itself paid', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set(...customer.authHeader)
      .send(orderBody({ paymentStatus: 'paid' }));

    expect(response.status).toBe(422);
  });

  it('rejects a body that supplies its own delivery code', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set(...customer.authHeader)
      .send(orderBody({ deliveryCode: '000000' }));

    expect(response.status).toBe(422);
  });

  it('refuses to let a driver place an order', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set(...driver.authHeader)
      .send(orderBody());

    expect(response.status).toBe(403);
  });

  it('refuses an anonymous order', async () => {
    const response = await request(app).post('/api/v1/orders').send(orderBody());
    expect(response.status).toBe(401);
  });

  it('reports a sold-out item as a conflict, not a crash', async () => {
    const soldOut = await seedProduct({
      storeId,
      price: 30,
      available: false,
      name: 'Sold Out Kota',
    });

    const response = await request(app)
      .post('/api/v1/orders')
      .set(...customer.authHeader)
      .send(orderBody({ items: [{ productId: soldOut, quantity: 1 }] }));

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/sold out/i);
  });
});

describe('reading an order', () => {
  it('gives the delivery code to the customer', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      deliveryCode: '482913',
    });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.deliveryCode).toBe('482913');
  });

  it('never sends the delivery code to the assigned driver', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'picked_up',
      deliveryCode: '482913',
    });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...driver.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.deliveryCode).toBeUndefined();
    // Checked against the whole serialised payload, not just the field, so a
    // stray copy anywhere in the response would fail this.
    expect(JSON.stringify(response.body)).not.toContain('482913');
  });

  it('never sends the delivery code to the vendor', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      deliveryCode: '482913',
    });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...vendor.authHeader);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('482913');
  });

  it('hides an order from an unrelated customer', async () => {
    const orderId = await seedOrder({ customerId: 'someone-else', storeId });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...customer.authHeader);

    // 404 rather than 403, so ids cannot be probed.
    expect(response.status).toBe(404);
  });

  it('hides an order from a vendor who does not own the store', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...otherVendor.authHeader);

    expect(response.status).toBe(404);
  });

  it('hides an order from a driver it is not assigned to', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
    });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...otherDriver.authHeader);

    expect(response.status).toBe(404);
  });
});

describe('listing orders', () => {
  it('returns only the caller’s own orders', async () => {
    await seedOrder({ customerId: 'cust-1', storeId });
    await seedOrder({ customerId: 'someone-else', storeId });

    const response = await request(app)
      .get('/api/v1/orders/mine')
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].customerId).toBe('cust-1');
  });

  it('returns only the vendor’s own store orders', async () => {
    const otherStore = await seedStore({ ownerId: 'vend-2' });
    await seedOrder({ customerId: 'cust-1', storeId });
    await seedOrder({ customerId: 'cust-1', storeId: otherStore });

    const response = await request(app)
      .get('/api/v1/orders/store')
      .set(...vendor.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].storeId).toBe(storeId);
  });

  it('shows drivers unclaimed orders they may actually claim', async () => {
    await seedOrder({ customerId: 'cust-1', storeId, status: 'ready' });
    await seedOrder({ customerId: 'cust-1', storeId, status: 'preparing' });
    // Not yet accepted by the vendor, so not claimable.
    await seedOrder({ customerId: 'cust-1', storeId, status: 'pending' });
    // Already taken.
    await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'ready',
      driverId: 'drv-2',
    });

    const response = await request(app)
      .get('/api/v1/orders/available')
      .set(...driver.authHeader);

    expect(response.status).toBe(200);
    // The ready one and the preparing one — this list and the claim rule
    // have to agree, or a driver sees orders they cannot take.
    expect(response.body.data).toHaveLength(2);
    expect(
      response.body.data.every(
        (o: { driverId: string | null }) => o.driverId === null,
      ),
    ).toBe(true);
  });

  it('keeps a customer out of the all-orders list', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set(...customer.authHeader);

    expect(response.status).toBe(403);
  });

  it('keeps a customer out of the vendor order list', async () => {
    const response = await request(app)
      .get('/api/v1/orders/store')
      .set(...customer.authHeader);

    expect(response.status).toBe(403);
  });

  it('lets an admin see every order', async () => {
    await seedOrder({ customerId: 'cust-1', storeId });
    await seedOrder({ customerId: 'someone-else', storeId });

    const response = await request(app)
      .get('/api/v1/orders')
      .set(...admin.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });
});

describe('advancing an order', () => {
  it('lets the owning vendor confirm it', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...vendor.authHeader)
      .send({ status: 'confirmed' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('confirmed');
  });

  it('stops a different vendor confirming it', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...otherVendor.authHeader)
      .send({ status: 'confirmed' });

    expect(response.status).toBe(404);
  });

  it('stops the customer confirming their own order', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...customer.authHeader)
      .send({ status: 'confirmed' });

    expect(response.status).toBe(409);
  });

  it('lets the customer cancel while still pending', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...customer.authHeader)
      .send({ status: 'cancelled' });

    expect(response.status).toBe(200);
  });

  it('stops the customer cancelling an unpaid order once the kitchen has started', async () => {
    // Nothing was paid in advance, so there is nothing to take the food cost
    // from. A paid order can be cancelled here, at a cost: see
    // cancellation.integration.test.ts and the payment route tests.
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'preparing',
      paymentMethod: 'cash',
    });

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...customer.authHeader)
      .send({ status: 'cancelled' });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/support/i);
  });

  it('refuses to let a driver mark an order delivered', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'picked_up',
    });

    // Delivery is only reachable through the code endpoint. This is the
    // route-level proof of that.
    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...driver.authHeader)
      .send({ status: 'delivered' });

    expect(response.status).toBe(409);
  });

  it('rejects a status that is not part of the lifecycle', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...vendor.authHeader)
      .send({ status: 'refunded-somehow' });

    expect(response.status).toBe(422);
  });
});

describe('accepting and delivering', () => {
  it('lets a driver claim a ready order', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'ready',
    });

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.driverId).toBe('drv-1');
    // Even on the response to their own claim, no code.
    expect(response.body.data.deliveryCode).toBeUndefined();
  });

  it('tells the second driver the order is taken', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'ready',
    });

    await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...otherDriver.authHeader);

    expect(response.status).toBe(409);
  });

  it('completes a delivery with the right code', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'picked_up',
      deliveryCode: '482913',
      paymentMethod: 'cash',
    });

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/complete`)
      .set(...driver.authHeader)
      .send({ code: '482913' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('delivered');
  });

  it('reports a wrong code with the attempts left', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'picked_up',
      deliveryCode: '482913',
    });

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/complete`)
      .set(...driver.authHeader)
      .send({ code: '000000' });

    expect(response.status).toBe(422);
    expect(response.body.error.details.attemptsRemaining).toBe(4);
    // The failure must not reveal the real code.
    expect(JSON.stringify(response.body)).not.toContain('482913');
  });

  it('rejects a malformed code before touching the order', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'picked_up',
    });

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/complete`)
      .set(...driver.authHeader)
      .send({ code: 'abcdef' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('stops a different driver completing the delivery', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'picked_up',
      deliveryCode: '482913',
    });

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/complete`)
      .set(...otherDriver.authHeader)
      .send({ code: '482913' });

    expect(response.status).toBe(404);
  });

  it('stops a customer completing their own delivery', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'picked_up',
      deliveryCode: '482913',
    });

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/complete`)
      .set(...customer.authHeader)
      .send({ code: '482913' });

    expect(response.status).toBe(403);
  });
});

describe('cancellation preview', () => {
  it('tells a customer what cancelling mid-prep would cost, and changes nothing', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'preparing',
      paymentStatus: 'paid',
      subtotal: 100,
      deliveryFee: 20,
    });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}/cancellation-preview`)
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      allowed: true,
      stage: 'in_kitchen',
      customerRefund: 28,
      vendorPay: 92,
      driverPay: 0,
    });
    // The platform's cost is not the customer's business.
    expect(response.body.data).not.toHaveProperty('goodwill');

    const order = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...customer.authHeader);
    expect(order.body.data.status).toBe('preparing');
  });

  it('includes the arrival fee once a driver has been dispatched', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'preparing',
      paymentStatus: 'paid',
      driverId: 'drv-1',
      subtotal: 100,
      deliveryFee: 20,
    });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}/cancellation-preview`)
      .set(...customer.authHeader);

    expect(response.body.data).toMatchObject({ customerRefund: 19.5, driverPay: 8.5 });
  });

  it('explains why an unpaid order cannot be cancelled by the customer mid-prep', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'preparing',
      paymentMethod: 'cash',
    });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}/cancellation-preview`)
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ allowed: false, code: 'needs_admin' });
    expect(response.body.data.reason).toMatch(/support/i);
  });

  it('says a delivered order cannot be cancelled', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId, status: 'delivered' });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}/cancellation-preview`)
      .set(...customer.authHeader);

    expect(response.body.data).toMatchObject({ allowed: false, code: 'terminal' });
  });

  it('keeps the preview from a vendor who does not own the store', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId, status: 'preparing' });

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}/cancellation-preview`)
      .set(...otherVendor.authHeader);

    expect(response.status).toBe(404);
  });

  it('refuses a cancellation when the order has moved on since the preview', async () => {
    // The customer was shown the mid-prep cost, then the driver collected it.
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      status: 'picked_up',
      paymentStatus: 'paid',
      driverId: 'drv-1',
    });

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...customer.authHeader)
      .send({ status: 'cancelled', expectedStage: 'in_kitchen' });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/moved on/i);

    const order = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...customer.authHeader);
    expect(order.body.data.status).toBe('picked_up');
  });

  it('cancels when the order is still at the stage the customer was shown', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...customer.authHeader)
      .send({ status: 'cancelled', expectedStage: 'before_prep' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('cancelled');
  });

  it('rejects a stage sent with any other status change', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(...vendor.authHeader)
      .send({ status: 'confirmed', expectedStage: 'before_prep' });

    expect(response.status).toBe(422);
  });
});
