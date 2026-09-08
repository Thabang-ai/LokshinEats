/**
 * Payment and wallet routes over HTTP, with real Firebase ID tokens.
 *
 * These are the endpoints where a missing guard costs money rather than
 * privacy, so the emphasis is on who is turned away: a customer must not be
 * able to refund themselves, credit their own wallet, or read anyone else's.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
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
let otherCustomer: TestAccount;
let vendor: TestAccount;
let admin: TestAccount;

let storeId: string;

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [customer, otherCustomer, vendor, admin] = await Promise.all([
    createTestAccount({ uid: 'cust-1', role: 'customer' }),
    createTestAccount({ uid: 'cust-2', role: 'customer' }),
    createTestAccount({ uid: 'vend-1', role: 'vendor' }),
    createTestAccount({ uid: 'admin-1', role: 'admin' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'cust-1', role: 'customer' }),
    seedUser({ uid: 'admin-1', role: 'admin' }),
  ]);

  storeId = await seedStore({ ownerId: 'vend-1' });
});

/** Take an order all the way to paid, the way a client would. */
async function payFor(orderId: string): Promise<string> {
  const initiated = await request(app)
    .post('/api/v1/payments')
    .set(...customer.authHeader)
    .send({ orderId });

  const paymentId = initiated.body.data.id as string;
  const reference = initiated.body.data.providerReference as string;

  await request(app)
    .post(`/api/v1/payments/sandbox/${reference}/complete`)
    .set(...customer.authHeader)
    .send({ outcome: 'succeed' });

  await request(app)
    .post(`/api/v1/payments/${paymentId}/verify`)
    .set(...customer.authHeader);

  return paymentId;
}

describe('initiating a payment', () => {
  it('charges the order total and returns the client payload', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      subtotal: 100,
      deliveryFee: 20,
    });

    const response = await request(app)
      .post('/api/v1/payments')
      .set(...customer.authHeader)
      .send({ orderId });

    expect(response.status).toBe(201);
    expect(response.body.data.amount).toBe(120);
    expect(response.body.data.status).toBe('initiated');
    // The sandbox says so plainly, so a UI cannot present it as a real
    // payment screen by accident.
    expect(response.body.meta.clientPayload.simulated).toBe(true);
  });

  it('rejects a body that names its own amount', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .post('/api/v1/payments')
      .set(...customer.authHeader)
      .send({ orderId, amount: 1 });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('refuses to pay for someone else’s order', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .post('/api/v1/payments')
      .set(...otherCustomer.authHeader)
      .send({ orderId });

    expect(response.status).toBe(404);
  });

  it('refuses an unregistered provider', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const response = await request(app)
      .post('/api/v1/payments')
      .set(...customer.authHeader)
      .send({ orderId, provider: 'paystack' });

    expect(response.status).toBe(422);
  });
});

describe('verifying a payment', () => {
  it('leaves the order unpaid until the charge is resolved', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const initiated = await request(app)
      .post('/api/v1/payments')
      .set(...customer.authHeader)
      .send({ orderId });

    const verified = await request(app)
      .post(`/api/v1/payments/${initiated.body.data.id}/verify`)
      .set(...customer.authHeader);

    expect(verified.status).toBe(200);
    expect(verified.body.data.status).toBe('initiated');

    const order = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...customer.authHeader);
    expect(order.body.data.paymentStatus).toBe('pending');
  });

  it('marks the order paid once the charge succeeds', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      subtotal: 100,
      deliveryFee: 20,
    });

    await payFor(orderId);

    const order = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(...customer.authHeader);

    expect(order.body.data.paymentStatus).toBe('paid');

    // And the vendor's share is waiting, not yet spendable.
    const wallet = await request(app)
      .get('/api/v1/wallets/me')
      .set(...vendor.authHeader);

    expect(wallet.body.data.pendingBalance).toBe(92);
    expect(wallet.body.data.availableBalance).toBe(0);
  });

  it('refuses to verify someone else’s payment', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });

    const initiated = await request(app)
      .post('/api/v1/payments')
      .set(...customer.authHeader)
      .send({ orderId });

    const response = await request(app)
      .post(`/api/v1/payments/${initiated.body.data.id}/verify`)
      .set(...otherCustomer.authHeader);

    expect(response.status).toBe(404);
  });
});

describe('payment visibility', () => {
  it('lists only the caller’s own payments', async () => {
    const mine = await seedOrder({ customerId: 'cust-1', storeId });
    await request(app)
      .post('/api/v1/payments')
      .set(...customer.authHeader)
      .send({ orderId: mine });

    const response = await request(app)
      .get('/api/v1/payments/mine')
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every(
        (payment: { customerId: string }) => payment.customerId === 'cust-1',
      ),
    ).toBe(true);
  });

  it('keeps a customer out of the all-payments list', async () => {
    const response = await request(app)
      .get('/api/v1/payments')
      .set(...customer.authHeader);

    expect(response.status).toBe(403);
  });

  it('keeps a vendor out of the all-payments list', async () => {
    const response = await request(app)
      .get('/api/v1/payments')
      .set(...vendor.authHeader);

    expect(response.status).toBe(403);
  });
});

describe('refunds', () => {
  it('refuses to let a customer refund themselves', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      subtotal: 100,
      deliveryFee: 20,
    });
    const paymentId = await payFor(orderId);

    const response = await request(app)
      .post(`/api/v1/payments/${paymentId}/refund`)
      .set(...customer.authHeader)
      .send({ reason: 'I would like my money back' });

    expect(response.status).toBe(403);

    // And no money moved.
    const wallet = await request(app)
      .get('/api/v1/wallets/me')
      .set(...customer.authHeader);
    expect(wallet.body.data.availableBalance).toBe(0);
  });

  it('lets an admin refund, and credits the customer', async () => {
    const orderId = await seedOrder({
      customerId: 'cust-1',
      storeId,
      subtotal: 100,
      deliveryFee: 20,
    });
    const paymentId = await payFor(orderId);

    const response = await request(app)
      .post(`/api/v1/payments/${paymentId}/refund`)
      .set(...admin.authHeader)
      .send({ reason: 'Order never arrived' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('refunded');

    const wallet = await request(app)
      .get('/api/v1/wallets/me')
      .set(...customer.authHeader);
    expect(wallet.body.data.availableBalance).toBe(120);
  });

  it('requires a reason', async () => {
    const orderId = await seedOrder({ customerId: 'cust-1', storeId });
    const paymentId = await payFor(orderId);

    // A refund with no stated reason is unauditable.
    const response = await request(app)
      .post(`/api/v1/payments/${paymentId}/refund`)
      .set(...admin.authHeader)
      .send({});

    expect(response.status).toBe(422);
  });
});

describe('wallets', () => {
  it('reports an empty wallet rather than a 404', async () => {
    const response = await request(app)
      .get('/api/v1/wallets/me')
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      availableBalance: 0,
      pendingBalance: 0,
      totalBalance: 0,
      currency: 'ZAR',
    });
  });

  it('refuses to show one user’s wallet to another', async () => {
    const response = await request(app)
      .get('/api/v1/wallets/cust-1')
      .set(...otherCustomer.authHeader);

    expect(response.status).toBe(403);
  });

  it('refuses to show a wallet ledger to a non-admin', async () => {
    const response = await request(app)
      .get('/api/v1/wallets/cust-1/transactions')
      .set(...customer.authHeader);

    // Even for their own id — the admin route is admin-only, and /me exists
    // for reading your own.
    expect(response.status).toBe(403);
  });

  it('lets a user read their own ledger', async () => {
    const response = await request(app)
      .get('/api/v1/wallets/me/transactions')
      .set(...customer.authHeader);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('refuses to let a customer credit their own wallet', async () => {
    const response = await request(app)
      .post('/api/v1/wallets/cust-1/credit')
      .set(...customer.authHeader)
      .send({ amount: 1000, type: 'bonus', description: 'Free money' });

    expect(response.status).toBe(403);

    const wallet = await request(app)
      .get('/api/v1/wallets/me')
      .set(...customer.authHeader);
    expect(wallet.body.data.availableBalance).toBe(0);
  });

  it('refuses to let a vendor credit a wallet', async () => {
    const response = await request(app)
      .post('/api/v1/wallets/vend-1/credit')
      .set(...vendor.authHeader)
      .send({ amount: 1000, type: 'bonus', description: 'Free money' });

    expect(response.status).toBe(403);
  });

  it('lets an admin issue a credit', async () => {
    const response = await request(app)
      .post('/api/v1/wallets/cust-1/credit')
      .set(...admin.authHeader)
      .send({
        amount: 50,
        type: 'bonus',
        description: 'Apology for a late delivery',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.availableBalance).toBe(50);
  });

  it('rejects a negative or sub-cent admin credit', async () => {
    for (const amount of [-50, 0, 10.001]) {
      const response = await request(app)
        .post('/api/v1/wallets/cust-1/credit')
        .set(...admin.authHeader)
        .send({ amount, type: 'adjustment', description: 'Bad amount' });

      expect(response.status).toBe(422);
    }
  });
});
