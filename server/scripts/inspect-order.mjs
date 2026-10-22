/**
 * Read one order back, or the newest one, exactly as it is stored.
 *
 * For answering "what actually happened to this order" without guessing from
 * screens: the status, the money frozen onto it, whether its delivery code is
 * where it belongs, and every wallet entry it has produced.
 *
 * Read-only. It writes nothing, ever.
 *
 *   node scripts/inspect-order.mjs              # the newest order
 *   node scripts/inspect-order.mjs <orderId>    # a particular one
 *
 * Credentials as for the other scripts: FIREBASE_PROJECT_ID plus
 * GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON, or the
 * emulator hosts for a local one.
 *
 * The delivery code itself is never printed - knowing whether it exists is
 * the point, and a code on a terminal is a code out of its box.
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const orderId = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const projectId = process.env.FIREBASE_PROJECT_ID ?? 'kasieats-34391';
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const inlineKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

const app = initializeApp(
  usingEmulator
    ? { projectId }
    : {
        projectId,
        credential: inlineKey
          ? cert(JSON.parse(inlineKey))
          : applicationDefault(),
      },
);
const db = getFirestore(app);

const rands = (value) =>
  typeof value === 'number' ? `R${value.toFixed(2)}` : '-';

const when = (value) => value?.toDate?.().toISOString() ?? '-';

const doc = orderId
  ? await db.collection('orders').doc(orderId).get()
  : (
      await db.collection('orders').orderBy('createdAt', 'desc').limit(1).get()
    ).docs[0];

if (!doc?.exists) {
  console.error(orderId ? `No order ${orderId}.` : 'No orders at all.');
  process.exit(1);
}

const o = doc.data();

console.log(`ORDER ${doc.id}`);
console.log(`  placed     ${when(o.createdAt)}`);
console.log(`  status     ${o.status}`);
console.log(`  kitchen    ${o.storeName ?? o.storeId}`);
console.log(`  customer   ${o.customerId}`);
console.log(`  driver     ${o.driverId ?? '(unassigned)'}`);
console.log(`  payment    ${o.paymentMethod} / ${o.paymentStatus}`);
console.log(
  `  items      ${(o.items ?? [])
    .map((i) => `${i.quantity}x ${i.name}`)
    .join(', ')}`,
);
console.log('  --- money frozen at checkout');
console.log(`  subtotal   ${rands(o.subtotal)}`);
console.log(`  delivery   ${rands(o.deliveryFee)}`);
console.log(`  total      ${rands(o.total)}`);
console.log(`  commission ${rands(o.commission ?? o.platformEarnings)}`);
console.log(`  to kitchen ${rands(o.vendorPayout ?? o.storePayout)}`);
console.log(`  to driver  ${rands(o.driverPayout ?? o.driverEarnings)}`);

const secret = await db.collection('orderSecrets').doc(doc.id).get();
console.log('  --- delivery code');
console.log(`  in orderSecrets      ${secret.exists}`);
console.log(
  `  on the order itself  ${'deliveryCode' in o || 'deliveryOTP' in o}` +
    ` (should be false - a driver can read the order)`,
);

const ledger = await db
  .collection('walletTransactions')
  .where('orderId', '==', doc.id)
  .get();

console.log(`  --- wallet entries: ${ledger.size}`);
// Sorted as written, and showing which balance each entry moved: a wallet
// has a pending and an available side, so the pair that releases a kitchen's
// money on delivery reads as "+55.17 available, -55.17 pending" rather than
// as a baffling pair that cancels out.
const entries = ledger.docs
  .map((d) => d.data())
  .sort(
    (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0),
  );

for (const t of entries) {
  const wallet = t.walletId === 'platform' ? 'platform' : t.walletId.slice(0, 8);
  console.log(
    `     ${String(t.type ?? '?').padEnd(16)}` +
      ` ${rands(t.amount).padStart(10)}` +
      ` ${String(t.balance ?? '?').padEnd(10)}` +
      ` -> ${rands(t.balanceAfter).padStart(10)}  ${wallet}`,
  );
}
