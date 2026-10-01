import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests need a running Firestore emulator and have their own
    // config; without this exclusion the pattern above would pick them up and
    // the unit suite would fail on a machine with no emulator.
    exclude: ['**/node_modules/**', 'src/**/*.integration.test.ts'],
    // config/env.ts validates process.env at import time and refuses to boot
    // on anything missing, so the suite supplies a complete configuration.
    env: {
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: 'lokshineats-test',
      COMMISSION_RATE: '0.08',
      DRIVER_DELIVERY_SHARE: '0.85',
    },
  },
});
