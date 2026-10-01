/**
 * Auth-emulator support for HTTP tests.
 *
 * These mint *real* Firebase ID tokens. The route tests then send them
 * through the actual middleware chain, so what gets exercised is the same
 * `verifyIdToken` call production uses — signature, expiry, revocation, and
 * custom claims included. A hand-rolled fake token, or a stubbed middleware,
 * would prove nothing about whether the chain is wired correctly.
 *
 * The flow is deliberately the same one a client performs:
 *
 *   1. Create the account through the Admin SDK.
 *   2. Attach the role as a custom claim.
 *   3. Sign in over the Identity Toolkit REST API to get an ID token.
 *
 * Order matters — claims must be set before signing in, because the token is
 * minted from the account as it stands at that moment. Doing it the other way
 * round produces a token with no role, which is exactly the bug the
 * `tokenRefreshRequired` flag warns clients about.
 */

import { auth as adminAuth } from '../config/firebase';
import type { Role } from '../middleware/auth';

/** The emulator accepts any API key, but one must be present. */
const FAKE_API_KEY = 'fake-api-key';

const DEFAULT_PASSWORD = 'test-password-123';

export function assertAuthEmulator(): void {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      'HTTP route tests must run against the Auth emulator. Use ' +
        '`npm run test:integration`, which starts it.',
    );
  }
}

function authHost(): string {
  assertAuthEmulator();
  return process.env.FIREBASE_AUTH_EMULATOR_HOST as string;
}

function projectId(): string {
  return process.env.FIREBASE_PROJECT_ID ?? 'lokshineats-test';
}

/** Delete every account in the Auth emulator. */
export async function resetAuth(): Promise<void> {
  const response = await fetch(
    `http://${authHost()}/emulator/v1/projects/${projectId()}/accounts`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    throw new Error(
      `Could not clear the Auth emulator: ${response.status} ${response.statusText}`,
    );
  }
}

export type TestAccount = {
  uid: string;
  email: string;
  role: Role;
  /** A real ID token carrying the role claim. */
  idToken: string;
  /** Convenience for supertest: `.set(...account.authHeader)`. */
  authHeader: [string, string];
};

/**
 * Create an account and return a signed-in ID token for it.
 *
 * `role` is omitted deliberately for accounts that should have no claim —
 * that is how a pre-claims legacy user behaves, and the auth middleware is
 * supposed to fall back to their Firestore document.
 */
export async function createTestAccount(input: {
  uid: string;
  role?: Role;
  email?: string;
}): Promise<TestAccount> {
  assertAuthEmulator();

  const email = input.email ?? `${input.uid}@example.test`;

  await adminAuth.createUser({
    uid: input.uid,
    email,
    password: DEFAULT_PASSWORD,
    emailVerified: true,
  });

  if (input.role) {
    await adminAuth.setCustomUserClaims(input.uid, { role: input.role });
  }

  const idToken = await signIn(email);

  return {
    uid: input.uid,
    email,
    role: input.role ?? 'customer',
    idToken,
    authHeader: ['Authorization', `Bearer ${idToken}`],
  };
}

/**
 * Sign in and return a fresh ID token.
 *
 * Also used on its own to re-mint a token after a role change, which is what
 * a client does when a response reports `meta.tokenRefreshRequired`.
 */
export async function signIn(
  email: string,
  password = DEFAULT_PASSWORD,
): Promise<string> {
  const response = await fetch(
    `http://${authHost()}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FAKE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  const body = (await response.json()) as {
    idToken?: string;
    error?: { message?: string };
  };

  if (!response.ok || !body.idToken) {
    throw new Error(
      `Could not sign in as ${email}: ${body.error?.message ?? response.status}`,
    );
  }

  return body.idToken;
}

/** Authorization header for an account, for supertest `.set()`. */
export function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
