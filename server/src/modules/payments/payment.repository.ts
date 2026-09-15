/**
 * Payment persistence.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import { buildPage, type Page } from '../../lib/pagination';
import {
  toPayment,
  type ListPaymentsQuery,
  type Payment,
  type PaymentRecordStatus,
} from './payment.model';

const collection = () => db.collection(Collections.payments);

export async function create(input: {
  orderId: string;
  customerId: string;
  amount: number;
  provider: string;
  providerReference: string;
}): Promise<Payment> {
  const ref = collection().doc();

  await ref.set({
    ...input,
    currency: 'ZAR',
    status: 'initiated',
    transactionId: null,
    failureReason: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snapshot = await ref.get();
  return toPayment(snapshot);
}

export async function findById(id: string): Promise<Payment | null> {
  const snapshot = await collection().doc(id).get();
  return snapshot.exists ? toPayment(snapshot) : null;
}

/**
 * The most recent payment attempt for an order.
 *
 * An order can have several: a declined card followed by a successful one.
 * Only the successful attempt settles, and settlement is idempotent, so a
 * retry after a decline cannot double-credit anyone.
 */
export async function findLatestForOrder(
  orderId: string,
): Promise<Payment | null> {
  const snapshot = await collection()
    .where('orderId', '==', orderId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  const doc = snapshot.docs[0];
  return doc ? toPayment(doc) : null;
}

export async function updateStatus(
  id: string,
  status: PaymentRecordStatus,
  extra: {
    transactionId?: string | null;
    failureReason?: string | null;
    refundedAmount?: number;
  } = {},
): Promise<Payment> {
  const ref = collection().doc(id);

  await ref.update({
    status,
    ...(extra.transactionId !== undefined
      ? { transactionId: extra.transactionId }
      : {}),
    ...(extra.failureReason !== undefined
      ? { failureReason: extra.failureReason }
      : {}),
    ...(extra.refundedAmount !== undefined
      ? { refundedAmount: extra.refundedAmount }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snapshot = await ref.get();
  return toPayment(snapshot);
}

export async function listForCustomer(
  customerId: string,
  query: ListPaymentsQuery,
): Promise<Page<Payment>> {
  return runList(
    (base) => base.where('customerId', '==', customerId),
    query,
  );
}

export async function listAll(query: ListPaymentsQuery): Promise<Page<Payment>> {
  return runList((base) => base, query);
}

async function runList(
  build: (base: FirebaseFirestore.Query) => FirebaseFirestore.Query,
  query: ListPaymentsQuery,
): Promise<Page<Payment>> {
  let firestoreQuery = build(collection());

  if (query.status) {
    firestoreQuery = firestoreQuery.where('status', '==', query.status);
  }

  firestoreQuery = firestoreQuery.orderBy('createdAt', 'desc');

  if (query.cursor) {
    const cursorDoc = await collection().doc(query.cursor).get();
    if (cursorDoc.exists) {
      firestoreQuery = firestoreQuery.startAfter(cursorDoc);
    }
  }

  const snapshot = await firestoreQuery.limit(query.limit + 1).get();
  return buildPage(snapshot.docs.map(toPayment), query.limit);
}
