/**
 * Firebase Admin SDK initialisation.
 *
 * The Admin SDK bypasses Firestore security rules, which is the whole point:
 * this API is the trusted party that owns order, payment, and wallet writes,
 * while the rules lock clients out of those collections entirely.
 *
 * Credentials resolve in this order:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON  (inline JSON — good for CI / Render)
 *   2. GOOGLE_APPLICATION_CREDENTIALS (path to a key file)
 *   3. Application Default Credentials (Cloud Run / GCE — nothing to configure)
 */

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type AppOptions,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { env } from './env';
import { moduleLogger } from './logger';

const log = moduleLogger('firebase');

function buildCredential(): AppOptions['credential'] {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      log.info('Using inline service-account credentials.');
      return cert(parsed);
    } catch (error) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON. ' +
          'Paste the whole service-account key, or leave it blank and use ' +
          'GOOGLE_APPLICATION_CREDENTIALS instead.',
        { cause: error },
      );
    }
  }

  // Both remaining paths are handled by applicationDefault(): it reads
  // GOOGLE_APPLICATION_CREDENTIALS when set, and otherwise falls back to the
  // metadata server on Google infrastructure.
  log.info(
    env.GOOGLE_APPLICATION_CREDENTIALS
      ? 'Using service-account key file from GOOGLE_APPLICATION_CREDENTIALS.'
      : 'Using application default credentials.',
  );
  return applicationDefault();
}

/** Initialised once per process; re-entrant so tests can import freely. */
function initialise(): App {
  const existing = getApps();
  if (existing.length > 0 && existing[0]) return existing[0];

  return initializeApp({
    credential: buildCredential(),
    projectId: env.FIREBASE_PROJECT_ID,
  });
}

export const firebaseApp: App = initialise();
export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp);

// Firestore rejects `undefined` values by default, which turns an optional
// field into a 500. Ignoring them means "field absent", which is what every
// call site actually intends.
db.settings({ ignoreUndefinedProperties: true });

/** Collection names, centralised so a typo cannot silently create a new one. */
export const Collections = {
  users: 'users',
  stores: 'stores',
  products: 'products',
  orders: 'orders',
  drivers: 'drivers',
  reviews: 'reviews',
  driverRatings: 'driverRatings',
  payments: 'payments',
  wallets: 'wallets',
  walletTransactions: 'walletTransactions',
  notifications: 'notifications',
} as const;
