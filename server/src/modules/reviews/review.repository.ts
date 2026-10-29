/**
 * Reviews, and the averages they move.
 *
 * The review and the aggregate are written in one transaction. Anything else
 * leaves a kitchen's page showing a number no set of reviews adds up to, and
 * the only way to find out would be to re-read every review there has ever
 * been.
 */

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import { ApiError } from '../../lib/ApiError';
import { buildPage, type Page } from '../../lib/pagination';
import {
  addToAverage,
  reviewId,
  toReview,
  type Review,
  type ReviewTarget,
} from './review.model';

const collection = () => db.collection(Collections.reviews);

export type WriteReviewInput = {
  orderId: string;
  target: ReviewTarget;
  subjectId: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string | null;
};

/**
 * Record one review and move the average it belongs to.
 *
 * The subject's document holds the running average rather than a count of
 * every review: a store page is read on every visit and must not read the
 * whole review history to show a number.
 */
export async function write(input: WriteReviewInput): Promise<Review> {
  const ref = collection().doc(reviewId(input.orderId, input.target));
  const subjectRef = subjectDoc(input.target, input.subjectId);

  await db.runTransaction(async (transaction: Transaction) => {
    const [existing, subject] = await Promise.all([
      transaction.get(ref),
      transaction.get(subjectRef),
    ]);

    if (existing.exists) {
      throw ApiError.conflict('You have already reviewed this order.');
    }
    if (!subject.exists) {
      throw ApiError.notFound('There is nobody here to review.');
    }

    const countField = input.target === 'store' ? 'reviewCount' : 'ratingCount';
    const next = addToAverage(
      Number(subject.get('rating') ?? 0),
      Number(subject.get(countField) ?? 0),
      input.rating,
    );

    transaction.set(ref, {
      orderId: input.orderId,
      target: input.target,
      subjectId: input.subjectId,
      // The shape the website wrote before reviews moved here, kept so its
      // existing documents and this one read the same way round.
      ...(input.target === 'store'
        ? { storeId: input.subjectId }
        : { driverId: input.subjectId }),
      customerId: input.customerId,
      customerName: input.customerName,
      rating: input.rating,
      comment: input.comment,
      createdAt: FieldValue.serverTimestamp(),
    });

    transaction.update(subjectRef, {
      rating: next.rating,
      [countField]: next.count,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return toReview(await ref.get());
}

function subjectDoc(target: ReviewTarget, subjectId: string) {
  return target === 'store'
    ? db.collection(Collections.stores).doc(subjectId)
    : db.collection(Collections.drivers).doc(subjectId);
}

/** Every review already left for this order, so a client can ask once. */
export async function findForOrder(orderId: string): Promise<Review[]> {
  const snapshot = await collection().where('orderId', '==', orderId).get();
  return snapshot.docs.map(toReview);
}

/**
 * What people said, newest first.
 *
 * Needs the composite index on (subjectId, createdAt) declared in
 * firebase/firestore.indexes.json. The emulator does not enforce indexes, so
 * without that entry this passes every test here and fails only in
 * production.
 */
export async function listFor(
  subjectId: string,
  options: { limit: number; cursor?: string },
): Promise<Page<Review>> {
  let query = collection()
    .where('subjectId', '==', subjectId)
    .orderBy('createdAt', 'desc');

  if (options.cursor) {
    const cursorDoc = await collection().doc(options.cursor).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc);
  }

  const snapshot = await query.limit(options.limit + 1).get();
  return buildPage(snapshot.docs.map(toReview), options.limit);
}
