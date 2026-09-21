/**
 * User routes over HTTP, with real Firebase ID tokens.
 *
 * Everything here goes through the actual Express app: security headers, CORS,
 * body parsing, `verifyIdToken`, role resolution, validation, the handler, and
 * the error boundary. That is the point — the unit suite already proves the
 * schemas reject a bad role, but only this proves the schema is actually
 * mounted on the route, in the right order, behind the right guard.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { auth as adminAuth, Collections, db } from '../../config/firebase';
import { assertEmulator, resetFirestore, seedUser } from '../../test/support';
import {
  assertAuthEmulator,
  bearer,
  createTestAccount,
  resetAuth,
  signIn,
} from '../../test/auth';

let app: Application;

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);
});

describe('authentication', () => {
  it('rejects a request with no token', async () => {
    const response = await request(app).get('/api/v1/users/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthenticated');
  });

  it('rejects a token that is not a real Firebase token', async () => {
    const response = await request(app)
      .get('/api/v1/users/me')
      .set(...bearer('not.a.token'));

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthenticated');
  });

  it('rejects a well-formed token signed by nobody', async () => {
    // A JWT with the right shape but no valid signature. This is the case a
    // hand-rolled fake token would have let through.
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
        'base64url',
      ),
      Buffer.from(
        JSON.stringify({ sub: 'attacker', role: 'admin', aud: 'lokshineats-test' }),
      ).toString('base64url'),
      'not-a-real-signature',
    ].join('.');

    const response = await request(app)
      .get('/api/v1/users/me')
      .set(...bearer(forged));

    expect(response.status).toBe(401);
  });

  it('accepts a real token and reports the account', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer', displayName: 'Thabo' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set(...account.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: 'cust-1',
      displayName: 'Thabo',
      role: 'customer',
    });
  });

  it('falls back to the user document when the token carries no role claim', async () => {
    // Accounts created before roles were mirrored into claims.
    const account = await createTestAccount({ uid: 'legacy-1' });
    await seedUser({ uid: 'legacy-1', role: 'vendor' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set(...account.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('vendor');
  });
});

describe('profile lifecycle', () => {
  it('reports no profile before one is created', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set(...account.authHeader);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });

  it('creates a profile after sign-up', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .post('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ displayName: 'Thabo Nkosi', phone: '0821234567' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: 'cust-1',
      displayName: 'Thabo Nkosi',
      role: 'customer',
    });
  });

  it('refuses to create a second profile for the same account', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });

    await request(app)
      .post('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ displayName: 'Thabo Nkosi' });

    const response = await request(app)
      .post('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ displayName: 'Someone Else' });

    // Idempotent by conflict rather than by overwrite — a repeat must not
    // silently reset a role or wipe an address.
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('conflict');
  });

  it('updates an existing profile', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ displayName: 'New Name' });

    expect(response.status).toBe(200);
    expect(response.body.data.displayName).toBe('New Name');
  });
});

describe('validation over HTTP', () => {
  it('returns per-field messages a client can show', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ phone: '12345' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_failed');
    expect(response.body.error.details).toHaveProperty('phone');
  });

  it('rejects an empty update rather than writing nothing', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .send({});

    expect(response.status).toBe(422);
  });

  it('rejects malformed JSON with a 400, not a crash', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .set('Content-Type', 'application/json')
      .send('{"displayName": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('bad_request');
  });
});

describe('privilege escalation', () => {
  it('refuses to let a customer make themselves an admin', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ role: 'admin' });

    // The field is not in the schema at all, so it is a validation error
    // rather than a silently ignored key.
    expect(response.status).toBe(422);

    // And the role really did not change.
    const after = await request(app)
      .get('/api/v1/users/me')
      .set(...account.authHeader);
    expect(after.body.data.role).toBe('customer');
  });

  it('refuses to let a new account sign up as an admin', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .post('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ displayName: 'Sneaky', role: 'admin' });

    expect(response.status).toBe(422);
  });

  it('refuses to let a new account sign up as a vendor', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });

    // Vendor is earned by registering a store, not self-assigned. The web
    // app's own registration page writes role: 'vendor' from the browser.
    const response = await request(app)
      .post('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ displayName: 'Sneaky', role: 'vendor' });

    expect(response.status).toBe(422);
  });

  it('keeps a customer out of the admin user list', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .get('/api/v1/users')
      .set(...account.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
  });

  it('keeps a driver out of the admin user list', async () => {
    const account = await createTestAccount({ uid: 'drv-1', role: 'driver' });
    await seedUser({ uid: 'drv-1', role: 'driver' });

    const response = await request(app)
      .get('/api/v1/users')
      .set(...account.authHeader);

    expect(response.status).toBe(403);
  });
});

describe('admin routes', () => {
  it('lists users for an admin', async () => {
    const admin = await createTestAccount({ uid: 'admin-1', role: 'admin' });
    await seedUser({ uid: 'admin-1', role: 'admin' });
    await seedUser({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'drv-1', role: 'driver' });

    const response = await request(app)
      .get('/api/v1/users')
      .set(...admin.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    expect(response.body).toHaveProperty('nextCursor');
  });

  it('filters the list by role', async () => {
    const admin = await createTestAccount({ uid: 'admin-1', role: 'admin' });
    await seedUser({ uid: 'admin-1', role: 'admin' });
    await seedUser({ uid: 'drv-1', role: 'driver' });
    await seedUser({ uid: 'drv-2', role: 'driver' });

    const response = await request(app)
      .get('/api/v1/users?role=driver')
      .set(...admin.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(
      response.body.data.every(
        (user: { role: string }) => user.role === 'driver',
      ),
    ).toBe(true);
  });

  it('applies a role change to both the document and the token claim', async () => {
    const admin = await createTestAccount({ uid: 'admin-1', role: 'admin' });
    await seedUser({ uid: 'admin-1', role: 'admin' });

    const target = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .patch('/api/v1/users/cust-1/role')
      .set(...admin.authHeader)
      .send({ role: 'driver' });

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('driver');
    // The old token still carries the old claim, so clients are told.
    expect(response.body.meta.tokenRefreshRequired).toBe(true);

    // The claim really did change: a freshly minted token now carries it, and
    // the account can reach a driver-only route.
    const refreshed = await signIn(target.email);
    const asDriver = await request(app)
      .get('/api/v1/orders/available')
      .set(...bearer(refreshed));

    expect(asDriver.status).toBe(200);
  });

  it("ends a demoted vendor's power at once, not when their token expires", async () => {
    const admin = await createTestAccount({ uid: 'admin-1', role: 'admin' });
    await seedUser({ uid: 'admin-1', role: 'admin' });

    const vendor = await createTestAccount({ uid: 'vend-1', role: 'vendor' });
    await seedUser({ uid: 'vend-1', role: 'vendor' });

    // Revocation is recorded to the second, and a token issued in that same
    // second is not counted as older than it. Real demotions are never that
    // close to a sign-in; the test has to wait for the clock to move.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const demoted = await request(app)
      .patch('/api/v1/users/vend-1/role')
      .set(...admin.authHeader)
      .send({ role: 'customer' });
    expect(demoted.status).toBe(200);

    // The token they already hold still says vendor. Before this change it
    // kept working for up to an hour; now it is refused outright.
    const withOldToken = await request(app)
      .get('/api/v1/orders/store')
      .set(...vendor.authHeader);
    expect(withOldToken.status).toBe(401);

    // Signing in again gets them a token that carries what they now are.
    const again = await signIn(vendor.email);
    const withNewToken = await request(app)
      .get('/api/v1/orders/store')
      .set(...bearer(again));
    expect(withNewToken.status).toBe(403);
  });

  it('leaves the admin who made the change signed in', async () => {
    const admin = await createTestAccount({ uid: 'admin-1', role: 'admin' });
    await seedUser({ uid: 'admin-1', role: 'admin' });
    await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await request(app)
      .patch('/api/v1/users/cust-1/role')
      .set(...admin.authHeader)
      .send({ role: 'driver' });

    // Revoking is aimed at the account changed, never the one changing it.
    const stillAdmin = await request(app)
      .get('/api/v1/users')
      .set(...admin.authHeader);
    expect(stillAdmin.status).toBe(200);
  });

  it('stops an admin removing their own admin role', async () => {
    const admin = await createTestAccount({ uid: 'admin-1', role: 'admin' });
    await seedUser({ uid: 'admin-1', role: 'admin' });

    // Almost always a mis-click, and it can leave the platform with no admin.
    const response = await request(app)
      .patch('/api/v1/users/admin-1/role')
      .set(...admin.authHeader)
      .send({ role: 'customer' });

    expect(response.status).toBe(409);
  });

  it('reports an unknown user as missing', async () => {
    const admin = await createTestAccount({ uid: 'admin-1', role: 'admin' });
    await seedUser({ uid: 'admin-1', role: 'admin' });

    const response = await request(app)
      .get('/api/v1/users/nobody')
      .set(...admin.authHeader);

    expect(response.status).toBe(404);
  });
});

describe('response contract', () => {
  it('echoes a correlation id on an error', async () => {
    const response = await request(app)
      .get('/api/v1/users/me')
      .set('X-Request-Id', 'trace-123');

    expect(response.headers['x-request-id']).toBe('trace-123');
    expect(response.body.error.requestId).toBe('trace-123');
  });

  it('does not leak the Authorization header back to the caller', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set(...account.authHeader);

    expect(JSON.stringify(response.body)).not.toContain(account.idToken);
  });
});

describe('profile address', () => {
  const address = {
    street: '88 Ndaba Street',
    city: 'Meadowlands',
    postalCode: '1852',
  };

  it('saves a structured address and returns it', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ address });

    expect(response.status).toBe(200);
    expect(response.body.data.address).toEqual(address);

    // Stored in the shape the web profile page and checkout read.
    const stored = await db.collection(Collections.users).doc('cust-1').get();
    expect(stored.data()?.address).toEqual(address);
  });

  it('clears a saved address when sent null', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });
    await db.collection(Collections.users).doc('cust-1').update({ address });

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ address: null });

    expect(response.status).toBe(200);
    expect(response.body.data.address).toBeNull();
  });

  it('rejects a partial address with a message the form can show', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ address: { street: '88 Ndaba Street', city: 'Meadowlands', postalCode: '18' } });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_failed');
    expect(
      Object.keys(response.body.error.details ?? {}).some((key) => key.startsWith('address')),
    ).toBe(true);
  });

  it('reads an address the web profile page wrote straight to Firestore', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });
    // Exactly what app/profile/page.tsx writes with setDoc(..., { merge: true }).
    await db.collection(Collections.users).doc('cust-1').update({ address, phone: '0821234567' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set(...account.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.address).toEqual(address);
  });

  it('still reads an old single-line address, as the street', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });
    await db.collection(Collections.users).doc('cust-1').update({ address: '12 Vilakazi Street' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set(...account.authHeader);

    expect(response.body.data.address).toEqual({
      street: '12 Vilakazi Street',
      city: '',
      postalCode: '',
    });
  });
});

describe('display name', () => {
  it('keeps the Firebase Auth name in step with the profile', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ displayName: 'Thabo Nkosi' });

    expect(response.status).toBe(200);

    // The web app greets customers by this field, not by the profile document.
    const authUser = await adminAuth.getUser('cust-1');
    expect(authUser.displayName).toBe('Thabo Nkosi');
  });

  it('leaves the Auth name alone when the name is not being changed', async () => {
    const account = await createTestAccount({ uid: 'cust-1', role: 'customer' });
    await seedUser({ uid: 'cust-1', role: 'customer' });
    await adminAuth.updateUser('cust-1', { displayName: 'Set On The Web' });

    await request(app)
      .patch('/api/v1/users/me')
      .set(...account.authHeader)
      .send({ phone: '0821234567' });

    const authUser = await adminAuth.getUser('cust-1');
    expect(authUser.displayName).toBe('Set On The Web');
  });
});
