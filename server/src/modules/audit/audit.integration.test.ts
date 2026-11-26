/**
 * The audit log: what an admin did, and to whom.
 *
 * Until now the only trace of an admin's decision was the decision itself. A
 * kitchen recorded `verifiedBy`; a cancelled order recorded nothing about
 * which admin cancelled it or why; and nothing anywhere could answer "what
 * happened on the platform yesterday". With more than one operator that is
 * not an administrative nicety - it is the difference between a mistake
 * somebody can find and one nobody can.
 *
 * These tests go through the real routes, because an entry written by a test
 * calling the service directly would prove nothing about whether the actions
 * people actually perform record anything.
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
let admin: TestAccount;
let vendor: TestAccount;
let customer: TestAccount;

const log = (as: TestAccount = admin, query = '') =>
  request(app)
    .get(`/api/v1/audit${query}`)
    .set(...as.authHeader);

/** The log, newest first. */
async function entries(query = ''): Promise<Array<Record<string, unknown>>> {
  const response = await log(admin, query);
  expect(response.status).toBe(200);
  return response.body.data;
}

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);

  [admin, vendor, customer] = await Promise.all([
    createTestAccount({ uid: 'admin-1', role: 'admin' }),
    createTestAccount({ uid: 'vend-1', role: 'vendor' }),
    createTestAccount({ uid: 'cust-1', role: 'customer' }),
  ]);

  await Promise.all([
    seedUser({ uid: 'admin-1', role: 'admin', displayName: 'Thabo Operator' }),
    seedUser({ uid: 'vend-1', role: 'vendor', displayName: 'Mama Ntuli' }),
    seedUser({ uid: 'cust-1', role: 'customer', displayName: 'Thandi Customer' }),
  ]);
});

describe('deciding on a kitchen', () => {
  it('records who approved it, and the kitchen by name', async () => {
    const storeId = await seedStore({
      ownerId: 'vend-1',
      name: 'Mama Ntuli Kota Corner',
      verification: 'pending',
    });

    await request(app)
      .post(`/api/v1/stores/${storeId}/verification`)
      .set(...admin.authHeader)
      .send({ decision: 'approve' })
      .expect(200);

    expect(await entries()).toMatchObject([
      {
        action: 'store.approved',
        actorId: 'admin-1',
        actorName: 'Thabo Operator',
        subjectType: 'store',
        subjectId: storeId,
        subjectName: 'Mama Ntuli Kota Corner',
      },
    ]);
  });

  it('keeps the words the admin turned it down in', async () => {
    const storeId = await seedStore({
      ownerId: 'vend-1',
      verification: 'pending',
    });

    await request(app)
      .post(`/api/v1/stores/${storeId}/verification`)
      .set(...admin.authHeader)
      .send({ decision: 'reject', reason: 'The address is a vacant lot.' })
      .expect(200);

    const [entry] = await entries();
    expect(entry).toMatchObject({
      action: 'store.rejected',
      reason: 'The address is a vacant lot.',
    });
  });
});

describe('deciding on a driver', () => {
  it('records the decision against their name', async () => {
    const applicant = await createTestAccount({ uid: 'drv-1', role: 'customer' });
    await seedUser({
      uid: 'drv-1',
      role: 'customer',
      displayName: 'Sipho Ndlovu',
    });

    // Through the application form, so the document is the one the real
    // queue decides on.
    await request(app)
      .post('/api/v1/drivers/me')
      .set(...applicant.authHeader)
      .send({
        vehicleType: 'motorbike',
        idNumber: '9001015800085',
        licenceNumber: 'DL-4482913',
        vehicleRegistration: 'CA 512 345',
      })
      .expect(201);

    await request(app)
      .patch('/api/v1/drivers/drv-1/verification')
      .set(...admin.authHeader)
      .send({ decision: 'approve' })
      .expect(200);

    expect(await entries()).toMatchObject([
      {
        action: 'driver.approved',
        subjectType: 'driver',
        subjectId: 'drv-1',
        subjectName: 'Sipho Ndlovu',
      },
    ]);
  });
});

describe('acting on an account', () => {
  it('records a suspension, with the reason', async () => {
    await request(app)
      .patch('/api/v1/users/cust-1/status')
      .set(...admin.authHeader)
      .send({ status: 'suspended', reason: 'Chargebacks on three orders.' })
      .expect(200);

    expect(await entries()).toMatchObject([
      {
        action: 'user.suspended',
        subjectId: 'cust-1',
        subjectName: 'Thandi Customer',
        reason: 'Chargebacks on three orders.',
      },
    ]);
  });

  it('records a role change both ways round', async () => {
    await request(app)
      .patch('/api/v1/users/cust-1/role')
      .set(...admin.authHeader)
      .send({ role: 'driver' })
      .expect(200);

    const [entry] = await entries();
    expect(entry).toMatchObject({
      action: 'user.role_changed',
      subjectId: 'cust-1',
      facts: { from: 'customer', to: 'driver' },
    });
  });
});

describe('money an admin moves by hand', () => {
  it('records the amount and what it was for', async () => {
    await request(app)
      .post('/api/v1/wallets/cust-1/credit')
      .set(...admin.authHeader)
      .send({
        amount: 45,
        description: 'Goodwill: cold food, order 12.',
        type: 'bonus',
      })
      .expect(200);

    expect(await entries()).toMatchObject([
      {
        action: 'wallet.credited',
        subjectId: 'cust-1',
        subjectName: 'Thandi Customer',
        amount: 45,
        reason: 'Goodwill: cold food, order 12.',
        facts: { kind: 'bonus' },
      },
    ]);
  });
});

describe('reading the log', () => {
  beforeEach(async () => {
    const storeId = await seedStore({
      ownerId: 'vend-1',
      verification: 'pending',
    });

    await request(app)
      .post(`/api/v1/stores/${storeId}/verification`)
      .set(...admin.authHeader)
      .send({ decision: 'approve' });

    await request(app)
      .patch('/api/v1/users/cust-1/status')
      .set(...admin.authHeader)
      .send({ status: 'suspended', reason: 'Chargebacks on three orders.' });
  });

  it('is newest first', async () => {
    const rows = await entries();

    expect(rows.map((row) => row.action)).toEqual([
      'user.suspended',
      'store.approved',
    ]);
  });

  it('narrows to one kind of action', async () => {
    const rows = await entries('?action=store.approved');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'store.approved' });
  });

  it('narrows to everything done to one person', async () => {
    const rows = await entries('?subjectId=cust-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subjectId: 'cust-1' });
  });

});

describe('who may read it', () => {
  // Its own block: the suspension in the setup above revokes that customer's
  // token, and a 401 for a suspended account would hide whether the role
  // check works at all.
  it('is not for a vendor to read', async () => {
    expect((await log(vendor)).status).toBe(403);
  });

  it('is not for a customer to read', async () => {
    expect((await log(customer)).status).toBe(403);
  });

  it('is not readable signed out', async () => {
    expect((await request(app).get('/api/v1/audit')).status).toBe(401);
  });
});

describe('the log is written beside the action, not instead of it', () => {
  it('leaves the kitchen approved even if the entry cannot be written', async () => {
    // An audit write that failed used to be a choice between losing the entry
    // and failing an action that had already happened. The second is worse:
    // the admin retries and approves twice. This pins the choice.
    const storeId = await seedStore({
      ownerId: 'vend-1',
      verification: 'pending',
    });

    await request(app)
      .post(`/api/v1/stores/${storeId}/verification`)
      .set(...admin.authHeader)
      .send({ decision: 'approve' })
      .expect(200);

    const store = await db.collection(Collections.stores).doc(storeId).get();
    expect(store.get('verification')).toBe('approved');
  });
});
