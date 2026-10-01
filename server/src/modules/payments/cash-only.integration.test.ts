/**
 * Cash-only mode: what the API does with no card or EFT provider.
 *
 * Launch runs this way (PAYMENT_PROVIDER=none), because the only provider
 * built so far is the sandbox, which marks orders paid without moving money.
 * The rule belongs on the server: an app that still offered card would
 * otherwise create orders nobody can ever pay for.
 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { registerPaymentProviders } from './payment.bootstrap';
import { resetProviders } from './payment.provider';

let app: Application;
let customer: TestAccount;
let productId: string;
let storeId: string;

function order(paymentMethod: string) {
  return {
    storeId,
    items: [{ productId, quantity: 2 }],
    deliveryAddress: {
      street: '12 Vilakazi Street',
      city: 'Soweto',
      postalCode: '1804',
    },
    paymentMethod,
    customerPhone: '0821234567',
  };
}

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
  productId = await seedProduct({ storeId, price: 45.5 });

  // No card provider at all: the state PAYMENT_PROVIDER=none leaves the
  // registry in.
  resetProviders();
});

// Other suites expect the sandbox to be there.
afterAll(() => {
  resetProviders();
  registerPaymentProviders();
});

describe('with no card provider', () => {
  it('tells the apps only cash is on offer', async () => {
    const response = await request(app).get('/api/v1/config');
    expect(response.status).toBe(200);
    expect(response.body.data.paymentMethods).toEqual(['cash']);
  });

  it('refuses a card order, however the app got to ask', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set(...customer.authHeader)
      .send(order('yoco'));

    expect(response.status).toBe(422);
    expect(response.body.error.message).toMatch(/cash on delivery/i);
  });

  it('refuses an EFT order too', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set(...customer.authHeader)
      .send(order('ozow'));

    expect(response.status).toBe(422);
  });

  it('takes a cash order as normal', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set(...customer.authHeader)
      .send(order('cash'));

    expect(response.status).toBe(201);
    expect(response.body.data.paymentMethod).toBe('cash');
  });
});

describe('with a card provider', () => {
  it('offers card and EFT alongside cash', async () => {
    registerPaymentProviders();

    const response = await request(app).get('/api/v1/config');
    expect(response.body.data.paymentMethods).toEqual(['cash', 'yoco', 'ozow']);
  });
});
