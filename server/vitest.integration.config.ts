import { defineConfig } from 'vitest/config';

/**
 * Integration tests — the ones that need a real Firestore.
 *
 * Kept separate from the unit suite so `npm test` stays fast and needs no
 * emulator. These are launched through `firebase emulators:exec`, which sets
 * FIRESTORE_EMULATOR_HOST for us; the Admin SDK picks that up and connects to
 * the emulator instead of a real project, so no credentials are involved and
 * nothing can touch production data.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],

    // Each file gets its own process, and files run one at a time. These
    // tests share one emulator database, so running them concurrently would
    // let one file's cleanup wipe another file's fixtures mid-assertion.
    pool: 'forks',
    fileParallelism: false,

    // scrypt-free but Firestore round trips are slower than pure logic.
    testTimeout: 20_000,
    hookTimeout: 20_000,

    env: {
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: 'lokshineats-test',
      COMMISSION_RATE: '0.08',
      DRIVER_DELIVERY_SHARE: '0.85',
      PAYMENT_PROVIDER: 'sandbox',
    },
  },
});
