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
  signIn,
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

describe('an account that applied to drive after signing up as a customer', () => {
  // Which is most of them: somebody orders food, then decides to deliver it.
  // Every test above hands the driver an account that was already a driver,
  // so all of this passed while a real approved driver could not accept a
  // single order - the delivery routes read the role, and approving an
  // application never changed it.
  let applicant: TestAccount;

  async function claimableOrder(): Promise<string> {
    const storeId = await seedStore({ ownerId: 'vend-1' });
    return seedOrder({
      customerId: 'cust-1',
      storeId,
      storeName: 'Mama Ntuli',
      status: 'confirmed',
    });
  }

  async function approve(uid: string): Promise<void> {
    await request(app)
      .patch(`/api/v1/drivers/${uid}/verification`)
      .set(...admin.authHeader)
      .send({ decision: 'approve' });
  }

  beforeEach(async () => {
    applicant = await createTestAccount({ uid: 'cust-9', role: 'customer' });
    await seedUser({ uid: 'cust-9', role: 'customer' });
  });

  it('is a driver once approved, and can accept work', async () => {
    await submit(applicant, motorbike);
    await approve('cust-9');

    // What the app does when told its token is out of date.
    const refreshed = await signIn(applicant.email);

    const orderId = await claimableOrder();
    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${refreshed}`);

    expect(response.status).toBe(200);
  });

  it('takes work on the token it already has, without signing in again', async () => {
    // The one that matters most: this is what the driver's phone is holding
    // when they tap accept. Its claim still says customer - the role was
    // granted minutes ago, and a token is good for an hour - so refusing on
    // the claim alone leaves an approved driver refused for that whole hour,
    // however many times they try.
    await submit(applicant, motorbike);
    await approve('cust-9');

    const orderId = await claimableOrder();
    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...applicant.authHeader);

    expect(response.status).toBe(200);
  });

  it('still refuses somebody the account itself says is a customer', async () => {
    // The check reads the account; it does not stop checking.
    const orderId = await claimableOrder();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...applicant.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/driver or admin role/i);
  });

  it('refuses an account with no profile at all', async () => {
    const stranger = await createTestAccount({ uid: 'ghost-1' });
    const orderId = await claimableOrder();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set(...stranger.authHeader);

    expect(response.status).toBe(403);
  });

  it('is told its token is out of date, rather than left guessing', async () => {
    await submit(applicant, motorbike);
    await approve('cust-9');

    const mine = await request(app)
      .get('/api/v1/drivers/me')
      .set(...applicant.authHeader);

    expect(mine.body.meta?.tokenRefreshRequired).toBe(true);
  });

  it('repairs an approval granted before any of this existed', async () => {
    // No promotion happened at the time, so opening the app has to do it.
    await submit(applicant, motorbike);
    await db.collection(Collections.drivers).doc('cust-9').update({
      status: 'approved',
    });

    const mine = await request(app)
      .get('/api/v1/drivers/me')
      .set(...applicant.authHeader);
    expect(mine.body.meta?.tokenRefreshRequired).toBe(true);

    const orderId = await claimableOrder();
    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${await signIn(applicant.email)}`);

    expect(response.status).toBe(200);
  });

  it('says nothing to a driver whose token is already right', async () => {
    await submit(driver, motorbike);
    await approve('drv-1');

    const mine = await request(app)
      .get('/api/v1/drivers/me')
      .set(...driver.authHeader);

    expect(mine.body.meta).toBeUndefined();
  });

  it('a refusal does not take the role away again', async () => {
    // They may be mid-delivery, and `assertApproved` already stops them
    // claiming anything new.
    await submit(applicant, motorbike);
    await approve('cust-9');
    await request(app)
      .patch('/api/v1/drivers/cust-9/verification')
      .set(...admin.authHeader)
      .send({ decision: 'reject', reason: 'Licence has expired.' });

    const user = await db.collection(Collections.users).doc('cust-9').get();
    expect(user.get('role')).toBe('driver');
  });

  it('a kitchen owner approved to drive keeps their kitchen', async () => {
    // One role per account: promoting a vendor would lock them out of the
    // kitchen they are running.
    const vendor = await createTestAccount({ uid: 'vend-9', role: 'vendor' });
    await seedUser({ uid: 'vend-9', role: 'vendor' });

    await submit(vendor, motorbike);
    await approve('vend-9');

    const user = await db.collection(Collections.users).doc('vend-9').get();
    expect(user.get('role')).toBe('vendor');
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

  it('says who each application belongs to', async () => {
    // A queue of bare uids is a queue nobody can judge: no name to recognise,
    // no number to call, and no way to see that an applicant is already
    // suspended.
    await submit(driver, motorbike);

    const queue = await request(app)
      .get('/api/v1/drivers')
      .set(...admin.authHeader);

    expect(queue.body.data[0].account).toMatchObject({
      email: 'drv-1@example.test',
      displayName: 'drv-1',
      status: 'active',
    });
  });

  it('an application whose account is gone still lists, without one', async () => {
    await submit(driver, motorbike);
    await db.collection(Collections.users).doc('drv-1').delete();

    const queue = await request(app)
      .get('/api/v1/drivers')
      .set(...admin.authHeader);

    expect(queue.body.data).toHaveLength(1);
    expect(queue.body.data[0].account).toBeNull();
  });

  it('every tab of the queue answers, not only "All"', async () => {
    await submit(driver, motorbike);
    await submit(otherDriver, bicycle);
    await request(app)
      .patch('/api/v1/drivers/drv-2/verification')
      .set(...admin.authHeader)
      .send({ decision: 'approve' });

    // The emulator does not enforce composite indexes, so this passed here
    // while the three filtered tabs returned a 500 against the real database:
    // the query ordered by `createdAt` and filtered on `status`, and no such
    // index was ever declared. It needs no index now.
    const [pending, approved, rejected, all] = await Promise.all(
      ['?status=pending', '?status=approved', '?status=rejected', ''].map(
        (query) =>
          request(app)
            .get(`/api/v1/drivers${query}`)
            .set(...admin.authHeader),
      ),
    );

    expect(pending.body.data.map((d: { id: string }) => d.id)).toEqual(['drv-1']);
    expect(approved.body.data.map((d: { id: string }) => d.id)).toEqual(['drv-2']);
    expect(rejected.body.data).toEqual([]);
    expect(all.body.data).toHaveLength(2);
  });

  it('an application with no date is still in the queue', async () => {
    // `orderBy('createdAt')` drops documents that lack the field entirely.
    // For a review queue that is an application nobody can see, let alone
    // decide - and one of those is how a driver ends up approved with no
    // record of anybody approving them.
    await submit(driver, motorbike);
    await db.collection(Collections.drivers).doc('drv-1').update({
      createdAt: null,
    });

    const queue = await request(app)
      .get('/api/v1/drivers?status=pending')
      .set(...admin.authHeader);

    expect(queue.body.data.map((d: { id: string }) => d.id)).toEqual(['drv-1']);
  });

  it('newest first, whatever the database hands back', async () => {
    await submit(driver, motorbike);
    await submit(otherDriver, bicycle);
    await db.collection(Collections.drivers).doc('drv-1').update({
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await db.collection(Collections.drivers).doc('drv-2').update({
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    const queue = await request(app)
      .get('/api/v1/drivers')
      .set(...admin.authHeader);

    expect(queue.body.data.map((d: { id: string }) => d.id)).toEqual([
      'drv-2',
      'drv-1',
    ]);
  });
});
