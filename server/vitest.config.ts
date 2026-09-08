import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // config/env.ts validates process.env at import time and refuses to boot
    // on anything missing, so the suite supplies a complete configuration.
    env: {
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: 'kasieats-test',
      COMMISSION_RATE: '0.08',
      DRIVER_DELIVERY_SHARE: '0.85',
    },
  },
});
