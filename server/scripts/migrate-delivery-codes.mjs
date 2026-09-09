/**
 * Move delivery codes off order documents into `orderSecrets`.
 *
 * Orders placed before the split store their code as `deliveryCode` or
 * `deliveryOTP` on the order itself — a document their driver is allowed to
 * read. The API falls back to reading it there, so nothing is broken, but
 * every such order stays exposed until the code is moved.
 *
 * This copies the code into `orderSecrets/{orderId}` and removes the inline
 * fields. It is safe to re-run: an order with no inline code is skipped, and
 * an existing secret is never overwritten.
 *
 * Dry run by default — it prints what it would do and changes nothing. Pass
 * --apply to actually write.
 *
 *   node scripts/migrate-delivery-codes.mjs                 # dry run
 *   node scripts/migrate-delivery-codes.mjs --apply         # for real
 *
 * Against the emulator, set FIRESTORE_EMULATOR_HOST. Against a real project,
 * set GOOGLE_APPLICATION_CREDENTIALS (or FIREBASE_SERVICE_ACCOUNT_JSON) and
 * FIREBASE_PROJECT_ID, and read the summary before passing --apply.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID to the project to migrate.');
  process.exit(1);
}

const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const app = initializeApp(
  usingEmulator
    ? { projectId }
    : { projectId, credential: applicationDefault() },
);
const db = getFirestore(app);

console.log(
  `${apply ? 'MIGRATING' : 'DRY RUN'} project ${projectId}` +
    (usingEmulator ? ` (emulator ${process.env.FIRESTORE_EMULATOR_HOST})` : ' (LIVE)'),
);

/** Firestore caps a batch at 500 writes; each order costs two. */
const ORDERS_PER_BATCH = 200;

let scanned = 0;
let moved = 0;
let alreadySecret = 0;
let noCode = 0;

let pending = db.batch();
let pendingCount = 0;

async function flush() {
  if (pendingCount === 0) return;
  if (apply) await pending.commit();
  pending = db.batch();
  pendingCount = 0;
}

const snapshot = await db.collection('orders').get();

for (const doc of snapshot.docs) {
  scanned += 1;
  const data = doc.data();

  const inline =
    typeof data.deliveryCode === 'string' && data.deliveryCode
      ? data.deliveryCode
      : typeof data.deliveryOTP === 'string' && data.deliveryOTP
        ? data.deliveryOTP
        : null;

  if (!inline) {
    noCode += 1;
    continue;
  }

  const secretRef = db.collection('orderSecrets').doc(doc.id);
  const existing = await secretRef.get();

  // Never overwrite a secret that is already there — the stored one is
  // authoritative, and the inline copy is what we are removing.
  if (!existing.exists) {
    pending.set(secretRef, {
      orderId: doc.id,
      code: inline,
      createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
      migratedAt: FieldValue.serverTimestamp(),
    });
    pendingCount += 1;
  } else {
    alreadySecret += 1;
  }

  pending.update(doc.ref, {
    deliveryCode: FieldValue.delete(),
    deliveryOTP: FieldValue.delete(),
  });
  pendingCount += 1;
  moved += 1;

  if (pendingCount >= ORDERS_PER_BATCH * 2) await flush();
}

await flush();

console.log(`  scanned              ${scanned}`);
console.log(`  had an inline code   ${moved}`);
console.log(`    already in secrets ${alreadySecret}`);
console.log(`  nothing to move      ${noCode}`);

if (!apply) {
  console.log('\nDry run — nothing was written. Re-run with --apply to migrate.');
}

process.exit(0);
