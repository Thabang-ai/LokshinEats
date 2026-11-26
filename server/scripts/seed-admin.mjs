/**
 * An admin account for the local stack.
 *
 * There is deliberately no admin self-signup: the role is granted out of
 * band, on a trusted account. Against the emulators that has to happen
 * somehow, and typing it into the Firebase console by hand every time the
 * emulator data is wiped is the sort of step that gets skipped.
 *
 * Emulators only - it refuses to run against a real project.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   FIREBASE_PROJECT_ID=kasieats-34391 \
 *   node scripts/seed-admin.mjs
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    'Refusing to run: this writes an admin account and both emulator hosts must be set.',
  );
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'kasieats-34391';
initializeApp({ projectId });

const email = 'admin@lokshin.test';
const password = 'password123';
const uid = 'seed-admin';

const auth = getAuth();
const db = getFirestore();

try {
  await auth.deleteUser(uid);
} catch {
  // Not there yet, which is the usual case on a fresh emulator.
}

await auth.createUser({ uid, email, password, displayName: 'Thabo Operator' });

// The claim is what the API trusts; the document is what the console reads.
await auth.setCustomUserClaims(uid, { role: 'admin' });

await db.collection('users').doc(uid).set({
  email,
  displayName: 'Thabo Operator',
  phone: '0820000000',
  role: 'admin',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

console.log(`Seeded admin ${email} (password: ${password}) in ${projectId}.`);
