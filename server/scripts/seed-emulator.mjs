/**
 * Seed the local emulators with enough data to use the app.
 *
 * Creates a customer and a vendor in the Auth emulator, their profile
 * documents, an open store, and a short menu — so the web app can be signed
 * into and an order placed end to end without touching the live project.
 *
 * Refuses to run unless both emulator hosts are set, so it can never seed or
 * overwrite real data.
 *
 * Usage (from server/):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   FIREBASE_PROJECT_ID=<project> node scripts/seed-emulator.mjs
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST ' +
      'must both be set, so this can only ever touch the emulators.',
  );
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'lokshineats-test';

// No credential: the emulators authenticate nothing.
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const PASSWORD = 'password123';

/** Create an auth account, tolerating one that already exists. */
async function ensureUser({ uid, email, role, displayName }) {
  try {
    await auth.createUser({ uid, email, password: PASSWORD, emailVerified: true });
  } catch (error) {
    if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') {
      throw error;
    }
  }

  await auth.setCustomUserClaims(uid, { role });

  await db.collection('users').doc(uid).set({
    email,
    displayName,
    phone: '0821234567',
    role,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return uid;
}

const customerId = await ensureUser({
  uid: 'seed-customer',
  email: 'customer@lokshin.test',
  role: 'customer',
  displayName: 'Thabo Nkosi',
});

const vendorId = await ensureUser({
  uid: 'seed-vendor',
  email: 'vendor@lokshin.test',
  role: 'vendor',
  displayName: 'Mama Ntuli',
});

await ensureUser({
  uid: 'seed-driver',
  email: 'driver@lokshin.test',
  role: 'driver',
  displayName: 'Sipho Dlamini',
});

const storeId = 'seed-store';
await db.collection('stores').doc(storeId).set({
  name: 'Mama Ntuli Kota Corner',
  description: 'Township favourites, made fresh.',
  cuisine: 'Kota Specialist',
  ownerId: vendorId,
  address: '12 Vilakazi Street',
  city: 'Soweto',
  phone: '0111234567',
  email: 'vendor@lokshin.test',
  categories: ['Kota', 'Braai'],
  image: '🍔',
  rating: 4.6,
  reviewCount: 32,
  deliveryTime: '30-45 min',
  deliveryFee: 20,
  minOrderAmount: 30,
  // Open, so checkout is not blocked by a closed store.
  isOpen: true,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

const menu = [
  { id: 'seed-kota', name: 'Full House Kota', price: 45.5, category: 'Kota' },
  { id: 'seed-chips', name: 'Slap Chips', price: 25, category: 'Sides' },
  { id: 'seed-braai', name: 'Braai Pack', price: 89.99, category: 'Braai' },
];

for (const item of menu) {
  await db.collection('products').doc(item.id).set({
    storeId,
    name: item.name,
    description: 'Seeded for local development.',
    price: item.price,
    category: item.category,
    available: true,
    isVegetarian: false,
    isSpicy: false,
    preparationTime: 20,
    image: '🍔',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

console.log(`Seeded project ${projectId}:`);
console.log(`  store    ${storeId} (open, R20 delivery, R30 minimum)`);
console.log(`  products ${menu.map((m) => m.name).join(', ')}`);
console.log('  accounts (password: ' + PASSWORD + ')');
console.log('    customer@lokshin.test');
console.log('    vendor@lokshin.test');
console.log('    driver@lokshin.test');
console.log(`  customer uid ${customerId}`);

process.exit(0);
