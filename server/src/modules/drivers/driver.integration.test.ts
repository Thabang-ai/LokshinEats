/**
 * Driver verification, over HTTP.
 *
 * The rule worth the most here: somebody who has filled in a form is not yet
 * a driver. Until this existed, the web sign-up told applicants their
 * application would be reviewed within 48 hours, reviewed nothing, kept
 * neither the licence number nor the registration it had asked for, and let
 * them take deliveries immediately.
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
let driver: TestAccount;
let otherDriver: TestAccount;
let admin: TestAccount;

const motorbike = {
  vehicleType: 'motorbike',
  licenceNumber: 'DL-4482913',
  vehicleRegistration: 'CA 512 345',
  idNumber: '9203145800084',
};

const bicycle = { vehicleType: 'bicycle', idNumber: '9203145800084' };

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);
  driver = await createTestAccount({ uid: 'drv-1', role: 'driver' });
  otherDriver = await createTestAccount({ uid: 'drv-2', role: 'driver' });
  admin = await createTestAccount({ uid: 'admin-1', role: 'admin' });
  await Promise.all([
    seedUser({ uid: 'drv-1', role: 'driver' }),
    seedUser({ uid: 'drv-2', role: 'driver' }),
    seedUser({ uid: 'admin-1', role: 'admin' }),
  ]);
});

const submit = (account: TestAccount, body: object) =>
  request(app)
    .post('/api/v1/drivers/me')
    .set(...account.authHeader)
    .send(body);

describe('telling us what you drive', () => {
  it('a motorbike needs a licence and a registration', async () => {
    const response = await submit(driver, motorbike);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      vehicleType: 'motorbike',
      licenceNumber: 'DL-4482913',
      vehicleRegistration: 'CA 512 345',
      status: 'pending',
    });
  });

  it('a motorbike without a licence is not an application', async () => {
    const response = await submit(driver, {
      vehicleType: 'motorbike',
      vehicleRegistration: 'CA 512 345',
      idNumber: '9203145800084',
    });

    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).toMatch(/licence/i);
  });

  it('a car without a registration is not an application', async () => {
    const response = await submit(driver, {
      vehicleType: 'car',
      licenceNumber: 'DL-4482913',
      idNumber: '9203145800084',
    });

    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).toMatch(/registration/i);
  });

  it('a bicycle needs neither, and is still an application', async () => {
    const response = await submit(driver, bicycle);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      vehicleType: 'bicycle',
      licenceNumber: null,
      vehicleRegistration: null,
      status: 'pending',
    });
  });

  it('a bicycle with a licence number is somebody confused', async () => {
    const response = await submit(driver, {
      ...bicycle,
      licenceNumber: 'DL-4482913',
    });

    expect(response.status).toBe(422);
  });

  it('everyone has to say what they deliver on', async () => {
    const response = await submit(driver, { idNumber: '9203145800084' });
    expect(response.status).toBe(422);
  });
});

describe('until an admin approves', () => {
  async function claimableOrder(): Promise<string> {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    return seedOrder({
      customerId: 'cust-1',
      storeId,
      storeName: 'Mama Ntuli',
      status: 'confirmed',
    });
  }

  it('a driver who has told us nothing cannot take a delivery', async () => {
    const orderId = await claimableOrder();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/what you deliver on/i);
  });

  it('a driver waiting on review cannot take a delivery', async () => {
    await submit(driver, motorbike);
    const orderId = await claimableOrder();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/still being checked/i);
  });

  it('an approved driver can', async () => {
    await submit(driver, motorbike);
    await request(app)
      .patch('/api/v1/drivers/drv-1/verification')
      .set(...admin.authHeader)
      .send({ decision: 'approve' });

    const orderId = await claimableOrder();
    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(200);
  });

  it('a turned-down driver is told why, and still cannot', async () => {
    await submit(driver, motorbike);
    await request(app)
      .patch('/api/v1/drivers/drv-1/verification')
      .set(...admin.authHeader)
      .send({ decision: 'reject', reason: 'Licence has expired.' });

    const orderId = await claimableOrder();
    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...driver.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('Licence has expired.');
  });

  it('changing vehicle sends an approved driver back to the queue', async () => {
    // Approved on a bicycle is not approved on a motorbike.
    await submit(driver, bicycle);
    await request(app)
      .patch('/api/v1/drivers/drv-1/verification')
      .set(...admin.authHeader)
      .send({ decision: 'approve' });

    await submit(driver, motorbike);

    const mine = await request(app)
      .get('/api/v1/drivers/me')
      .set(...driver.authHeader);
    expect(mine.body.data.status).toBe('pending');
  });
});

describe('who may decide', () => {
  it('not the driver themselves', async () => {
    await submit(driver, motorbike);

    const response = await request(app)
      .patch('/api/v1/drivers/drv-1/verification')
      .set(...driver.authHeader)
      .send({ decision: 'approve' });

    expect(response.status).toBe(403);
  });

  it('not another driver', async () => {
    await submit(driver, motorbike);

    const response = await request(app)
      .patch('/api/v1/drivers/drv-1/verification')
      .set(...otherDriver.authHeader)
      .send({ decision: 'approve' });

    expect(response.status).toBe(403);
  });

  it('a refusal has to say why', async () => {
    await submit(driver, motorbike);

    const response = await request(app)
      .patch('/api/v1/drivers/drv-1/verification')
      .set(...admin.authHeader)
      .send({ decision: 'reject' });

    expect(response.status).toBe(422);
  });

  it('the driver is told the outcome', async () => {
    await submit(driver, motorbike);
    await request(app)
      .patch('/api/v1/drivers/drv-1/verification')
      .set(...admin.authHeader)
      .send({ decision: 'approve' });

    const notes = await db
      .collection(Collections.notifications)
      .where('userId', '==', 'drv-1')
      .get();

    expect(notes.docs.map((d) => d.get('kind'))).toContain('driver_approved');
  });
});

describe('what a driver can see', () => {
  it('their own application, and nobody else', async () => {
    await submit(driver, motorbike);

    const mine = await request(app)
      .get('/api/v1/drivers/me')
      .set(...driver.authHeader);
    expect(mine.body.data.licenceNumber).toBe('DL-4482913');

    const theirs = await request(app)
      .get('/api/v1/drivers/me')
      .set(...otherDriver.authHeader);
    expect(theirs.body.data).toBeNull();
  });

  it('the review queue is for admins only', async () => {
    await submit(driver, motorbike);

    const asDriver = await request(app)
      .get('/api/v1/drivers')
      .set(...driver.authHeader);
    expect(asDriver.status).toBe(403);

    const asAdmin = await request(app)
      .get('/api/v1/drivers?status=pending')
      .set(...admin.authHeader);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data).toHaveLength(1);
  });
});
