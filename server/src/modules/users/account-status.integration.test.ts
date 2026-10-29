/**
 * Shutting an account out, and letting it back in.
 *
 * An admin could change what somebody was allowed to do and nothing else.
 * There was no way to stop a driver who had taken a customer's cash, or a
 * kitchen taking orders it was not cooking, short of changing their role -
 * which leaves them signed in and ordering food like anyone else.
 *
 * What these pin down is that a suspension actually bites: the sign-in is
 * disabled and the session already open on a phone stops on its next request,
 * rather than lasting until the token expires an hour later.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { auth as adminAuth, Collections, db } from '../../config/firebase';
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
let admin: TestAccount;
let customer: TestAccount;
let driver: TestAccount;
let vendor: TestAccount;

const REASON = 'Took a customer cash payment and kept it.';

function suspend(uid: string, as: TestAccount = admin, reason = REASON) {
  return request(app)
    .patch(`/api/v1/users/${uid}/status`)
    .set(...as.authHeader)
    .send({ status: 'suspended', reason });
}

function reinstate(uid: string, as: TestAccount = admin) {
  return request(app)
    .patch(`/api/v1/users/${uid}/status`)
    .set(...as.authHeader)
    .send({ status: 'active' });
}

function remove(uid: string, as: TestAccount = admin, reason = REASON) {
  return request(app)
    .delete(`/api/v1/users/${uid}`)
    .set(...as.authHeader)
    .send({ reason });
}

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [admin, customer, driver, vendor] = await Promise.all([
    createTestAccount({ uid: 'admin-1', role: 'admin' }),
    createTestAccount({ uid: 'cust-1', role: 'customer' }),
    createTestAccount({ uid: 'drv-1', role: 'driver' }),
    createTestAccount({ uid: 'vend-1', role: 'vendor' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'admin-1', role: 'admin' }),
    seedUser({ uid: 'cust-1', role: 'customer', displayName: 'Thabo' }),
    seedUser({ uid: 'drv-1', role: 'driver' }),
    seedUser({ uid: 'vend-1', role: 'vendor' }),
  ]);
});

describe('suspending an account', () => {
  it('stops the session already open on their phone', async () => {
    // The whole point. Their token is still minutes from expiry.
    await suspend('drv-1');

    const response = await request(app)
      .get('/api/v1/users/me')
      .set(...driver.authHeader);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/suspended/i);
  });

  it('stops them signing back in', async () => {
    await suspend('drv-1');

    expect((await adminAuth.getUser('drv-1')).disabled).toBe(true);
  });

  it('records who decided and why', async () => {
    const response = await suspend('cust-1');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'suspended',
      statusReason: REASON,
      statusChangedBy: 'admin-1',
    });
    expect(response.body.data.statusChangedAt).toEqual(expect.any(String));
  });

  it('will not do it silently', async () => {
    const response = await request(app)
      .patch('/api/v1/users/cust-1/status')
      .set(...admin.authHeader)
      .send({ status: 'suspended' });

    expect(response.status).toBe(422);
  });

  it('closes the kitchen of a suspended vendor', async () => {
    // An open kitchen takes orders. Nobody is there to cook them.
    const storeId = await seedStore({ ownerId: 'vend-1', isOpen: true });

    await suspend('vend-1');

    const store = await db.collection(Collections.stores).doc(storeId).get();
    expect(store.get('isOpen')).toBe(false);
  });

  it('lets them back in, and says nothing is held against them', async () => {
    await suspend('cust-1');
    const response = await reinstate('cust-1');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'active',
      statusReason: null,
    });
    expect((await adminAuth.getUser('cust-1')).disabled).toBe(false);
  });

  it('a reinstated kitchen is not reopened behind its owner', async () => {
    // Theirs to open when they are ready to cook, not ours.
    const storeId = await seedStore({ ownerId: 'vend-1', isOpen: true });
    await suspend('vend-1');
    await reinstate('vend-1');

    const store = await db.collection(Collections.stores).doc(storeId).get();
    expect(store.get('isOpen')).toBe(false);
  });
});

describe('removing an account', () => {
  it('deletes the sign-in and marks the profile', async () => {
    const response = await remove('cust-1');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'removed',
      statusReason: REASON,
      statusChangedBy: 'admin-1',
    });
    await expect(adminAuth.getUser('cust-1')).rejects.toThrow();
  });

  it('keeps the profile, so their old orders still have a name on them', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    await seedOrder({ customerId: 'cust-1', storeId, status: 'delivered' });

    await remove('cust-1');

    const profile = await db.collection(Collections.users).doc('cust-1').get();
    expect(profile.exists).toBe(true);
    expect(profile.get('displayName')).toBe('Thabo');
  });

  it('refuses while a driver is still carrying somebody dinner', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'picked_up',
    });

    const response = await remove('drv-1');

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/unfinished order/i);
    expect((await adminAuth.getUser('drv-1')).disabled).toBe(false);
  });

  it('refuses while a kitchen has food on the stove', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    await seedOrder({ customerId: 'cust-1', storeId, status: 'preparing' });

    const response = await remove('vend-1');

    expect(response.status).toBe(409);
  });

  it('allows it once everything they owed is finished', async () => {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    await seedOrder({
      customerId: 'cust-1',
      storeId,
      driverId: 'drv-1',
      status: 'delivered',
    });

    expect((await remove('drv-1')).status).toBe(200);
  });

  it('cannot be undone by reinstating them', async () => {
    await remove('cust-1');

    const response = await reinstate('cust-1');

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/sign up again/i);
  });
});

describe('who an admin may not touch', () => {
  it('not themselves', async () => {
    const response = await suspend('admin-1');

    expect(response.status).toBe(409);
    expect((await adminAuth.getUser('admin-1')).disabled).toBe(false);
  });

  it('not another admin, until that admin is demoted', async () => {
    await createTestAccount({ uid: 'admin-2', role: 'admin' });
    await seedUser({ uid: 'admin-2', role: 'admin' });

    expect((await suspend('admin-2')).status).toBe(409);
    expect((await remove('admin-2')).status).toBe(409);

    await request(app)
      .patch('/api/v1/users/admin-2/role')
      .set(...admin.authHeader)
      .send({ role: 'customer' });

    expect((await suspend('admin-2')).status).toBe(200);
  });

  it('not somebody who does not exist', async () => {
    expect((await suspend('nobody-at-all')).status).toBe(404);
  });
});

describe('who may do any of this', () => {
  it('not a customer', async () => {
    expect((await suspend('drv-1', customer)).status).toBe(403);
    expect((await remove('drv-1', customer)).status).toBe(403);
  });

  it('not a vendor, and not a driver', async () => {
    expect((await suspend('cust-1', vendor)).status).toBe(403);
    expect((await remove('cust-1', driver)).status).toBe(403);
  });

  it('nobody signed out', async () => {
    const response = await request(app)
      .patch('/api/v1/users/cust-1/status')
      .send({ status: 'suspended', reason: REASON });

    expect(response.status).toBe(401);
  });
});
