/**
 * Integration-test support.
 *
 * These helpers talk to the Firestore emulator that `npm run test:integration`
 * starts. They exist so each test can state its own preconditions in a couple
 * of lines, rather than assembling a dozen fields of fixture noise that
 * obscures what is being asserted.
 *
 * Nothing here may run against a real project: `assertEmulator` refuses to
 * proceed unless FIRESTORE_EMULATOR_HOST is set, so a misconfigured run
 * cannot wipe live data with `resetFirestore`.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../config/firebase';
import { computeOrderEconomics } from '../lib/money';
import type { AuthContext, Role } from '../middleware/auth';

/** Guard against ever pointing these helpers at a real database. */
export function assertEmulator(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'Integration tests must run against the Firestore emulator. Use ' +
        '`npm run test:integration`, which sets FIRESTORE_EMULATOR_HOST.',
    );
  }
}

/**
 * Delete every document in the emulator.
 *
 * Uses the emulator's own bulk-delete endpoint rather than walking
 * collections, which is both faster and does not miss subcollections.
 */
export async function resetFirestore(): Promise<void> {
  assertEmulator();

  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'lokshineats-test';

  const response = await fetch(
    `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    throw new Error(
      `Could not clear the emulator: ${response.status} ${response.statusText}`,
    );
  }
}

/** A caller identity, as the auth middleware would have produced it. */
export function actor(uid: string, role: Role, email = `${uid}@example.test`): AuthContext {
  return { uid, email, role, roleFromClaim: true };
}

export async function seedUser(input: {
  uid: string;
  role: Role;
  displayName?: string;
}): Promise<void> {
  await db.collection(Collections.users).doc(input.uid).set({
    email: `${input.uid}@example.test`,
    displayName: input.displayName ?? input.uid,
    phone: '0821234567',
    role: input.role,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function seedStore(input: {
  id?: string;
  ownerId: string;
  name?: string;
  isOpen?: boolean;
  deliveryFee?: number;
  minOrderAmount?: number;
}): Promise<string> {
  const ref = input.id
    ? db.collection(Collections.stores).doc(input.id)
    : db.collection(Collections.stores).doc();

  await ref.set({
    name: input.name ?? 'Test Kitchen',
    description: 'A store used by tests.',
    cuisine: 'Kota Specialist',
    ownerId: input.ownerId,
    address: '12 Vilakazi Street',
    city: 'Soweto',
    categories: [],
    rating: 0,
    reviewCount: 0,
    deliveryTime: '30-45 min',
    deliveryFee: input.deliveryFee ?? 20,
    minOrderAmount: input.minOrderAmount ?? 0,
    isOpen: input.isOpen ?? true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

export async function seedProduct(input: {
  id?: string;
  storeId: string;
  name?: string;
  price: number;
  available?: boolean;
}): Promise<string> {
  const ref = input.id
    ? db.collection(Collections.products).doc(input.id)
    : db.collection(Collections.products).doc();

  await ref.set({
    storeId: input.storeId,
    name: input.name ?? 'Full House Kota',
    description: '',
    price: input.price,
    category: 'Kota',
    available: input.available ?? true,
    isVegetarian: false,
    isSpicy: false,
    preparationTime: 20,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

/**
 * Write an order directly, bypassing the placement flow.
 *
 * Used by tests about what happens *after* an order exists — settlement,
 * delivery, refunds — so they do not have to re-exercise pricing each time.
 * Economics are computed the same way the service computes them, so the
 * figures are internally consistent.
 */
export async function seedOrder(input: {
  id?: string;
  customerId: string;
  storeId: string;
  storeName?: string;
  driverId?: string | null;
  status?: string;
  paymentMethod?: 'cash' | 'yoco' | 'ozow';
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  subtotal?: number;
  deliveryFee?: number;
  deliveryCode?: string;
  deliveryCodeAttempts?: number;
  /**
   * Write the code onto the order document instead of into `orderSecrets`,
   * reproducing an order placed before codes were split out. Used to check
   * that the fallback still lets historical deliveries be closed.
   */
  legacyCodeOnDocument?: boolean;
}): Promise<string> {
  const subtotal = input.subtotal ?? 100;
  const deliveryFee = input.deliveryFee ?? 20;
  const economics = computeOrderEconomics(subtotal, deliveryFee);

  const ref = input.id
    ? db.collection(Collections.orders).doc(input.id)
    : db.collection(Collections.orders).doc();

  await ref.set({
    customerId: input.customerId,
    customerName: 'Test Customer',
    customerPhone: '0821234567',
    storeId: input.storeId,
    storeName: input.storeName ?? 'Test Kitchen',
    driverId: input.driverId ?? null,
    items: [
      {
        productId: 'seeded-product',
        name: 'Full House Kota',
        price: subtotal,
        quantity: 1,
        specialInstructions: null,
        lineTotal: subtotal,
      },
    ],
    status: input.status ?? 'pending',
    subtotal,
    deliveryFee,
    total: Math.round((subtotal + deliveryFee) * 100) / 100,
    paymentMethod: input.paymentMethod ?? 'yoco',
    paymentStatus: input.paymentStatus ?? 'pending',
    paymentTransactionId: null,
    deliveryAddress: {
      street: '12 Vilakazi Street',
      city: 'Soweto',
      postalCode: '1804',
      instructions: null,
    },
    // Only legacy orders carry the code on the document; the default shape
    // keeps it in orderSecrets, where no client can read it.
    ...(input.legacyCodeOnDocument
      ? { deliveryCode: input.deliveryCode ?? '482913' }
      : {}),
    deliveryVerified: false,
    deliveryCodeAttempts: input.deliveryCodeAttempts ?? 0,
    deliveredAt: null,
    ...economics,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (!input.legacyCodeOnDocument) {
    await db.collection(Collections.orderSecrets).doc(ref.id).set({
      orderId: ref.id,
      code: input.deliveryCode ?? '482913',
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return ref.id;
}

/** The delivery code as stored in `orderSecrets`, or null if none is there. */
export async function readOrderSecret(orderId: string): Promise<string | null> {
  const snapshot = await db
    .collection(Collections.orderSecrets)
    .doc(orderId)
    .get();
  const code = snapshot.get('code');
  return typeof code === 'string' ? code : null;
}

/** Read a wallet's raw balances, or zeros when it has no document. */
export async function readWallet(
  walletId: string,
): Promise<{ available: number; pending: number }> {
  const snapshot = await db.collection(Collections.wallets).doc(walletId).get();
  if (!snapshot.exists) return { available: 0, pending: 0 };

  return {
    available: Number(snapshot.get('availableBalance') ?? 0),
    pending: Number(snapshot.get('pendingBalance') ?? 0),
  };
}

/** Every ledger entry for a wallet, oldest first. */
export async function readLedger(walletId: string): Promise<
  Array<{
    id: string;
    type: string;
    amount: number;
    balance: string;
    balanceAfter: number;
    orderId: string | null;
  }>
> {
  const snapshot = await db
    .collection(Collections.walletTransactions)
    .where('walletId', '==', walletId)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      type: String(doc.get('type')),
      amount: Number(doc.get('amount') ?? 0),
      balance: String(doc.get('balance')),
      balanceAfter: Number(doc.get('balanceAfter') ?? 0),
      orderId: (doc.get('orderId') as string | null) ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Read one order document. */
export async function readOrder(
  orderId: string,
): Promise<Record<string, unknown> | undefined> {
  const snapshot = await db.collection(Collections.orders).doc(orderId).get();
  return snapshot.data();
}
