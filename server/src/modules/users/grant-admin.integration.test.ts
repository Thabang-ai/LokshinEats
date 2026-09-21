/**
 * scripts/grant-admin.mjs: making the first admin of a fresh deployment.
 *
 * Run as the operator runs it - a separate process against the emulators -
 * and judged by what the API then allows, since the point of the script is
 * that the API's own claim check lets the account in.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { auth as adminAuth, db } from '../../config/firebase';
import { assertEmulator, resetFirestore, seedUser } from '../../test/support';
import {
  assertAuthEmulator,
  bearer,
  createTestAccount,
  resetAuth,
  signIn,
  type TestAccount,
} from '../../test/auth';

const run = promisify(execFile);
const script = path.resolve(__dirname, '..', '..', '..', 'scripts', 'grant-admin.mjs');

function grantAdmin(...args: string[]) {
  return run(process.execPath, [script, ...args], { env: process.env });
}

let app: Application;
let account: TestAccount;

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);
  // As sign-up leaves them: a customer claim and a customer profile.
  account = await createTestAccount({ uid: 'ops-1', role: 'customer' });
  await seedUser({ uid: 'ops-1', role: 'customer' });
});

describe('grant-admin', () => {
  it('a dry run changes nothing', async () => {
    const { stdout } = await grantAdmin(account.email);

    expect(stdout).toMatch(/Dry run/);
    expect((await adminAuth.getUser('ops-1')).customClaims?.role).toBe('customer');
    expect((await db.collection('users').doc('ops-1').get()).get('role')).toBe(
      'customer',
    );
  });

  it('--apply lets the account into admin routes once it signs in again', async () => {
    await grantAdmin(account.email, '--apply');

    // The session it had is ended, not left running on the old role.
    const stale = await request(app).get('/api/v1/users').set(...account.authHeader);
    expect(stale.status).toBe(401);

    const fresh = await signIn(account.email);
    const response = await request(app).get('/api/v1/users').set(...bearer(fresh));
    expect(response.status).toBe(200);

    const profile = await db.collection('users').doc('ops-1').get();
    expect(profile.get('role')).toBe('admin');
  });

  it('refuses an email with no account', async () => {
    await expect(grantAdmin('nobody@example.test', '--apply')).rejects.toMatchObject({
      stderr: expect.stringMatching(/Sign up in the web app first/),
    });
  });
});
