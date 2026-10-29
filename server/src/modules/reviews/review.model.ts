/**
 * What a customer thought of the kitchen and the driver.
 *
 * Both exist for the same reason: everything a customer sees before ordering
 * is written by the person selling to them. A rating is the only part of a
 * kitchen's page, and the only part of a driver's record, that somebody else
 * wrote.
 *
 * Reviews are keyed by the order and the target - `ord-1_store`,
 * `ord-1_driver` - so a customer cannot rate the same meal twice by sending
 * the same request twice, and no counter needs guarding against it.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { toIso, toNumber, toStringOr } from '../../lib/serialize';

export const REVIEW_TARGETS = ['store', 'driver'] as const;
export type ReviewTarget = (typeof REVIEW_TARGETS)[number];

export type Review = {
  id: string;
  orderId: string;
  target: ReviewTarget;
  /** The store or the driver being rated. */
  subjectId: string;
  customerId: string;
  /** Shown with the review, because "A customer" says nothing. */
  customerName: string;
  rating: number;
  comment: string | null;
  createdAt: string | null;
};

/** Whole stars, one to five: half a star is a precision nobody feels. */
const ratingSchema = z
  .number()
  .int('Give a whole number of stars.')
  .min(1, 'Give at least one star.')
  .max(5, 'Five stars is the most.');

const commentSchema = z
  .string()
  .trim()
  .max(500, 'That review is too long - keep it under 500 characters.')
  .optional();

const oneReviewSchema = z
  .object({ rating: ratingSchema, comment: commentSchema })
  .strict();

/**
 * Rate the kitchen, the driver, or both.
 *
 * At least one of them: a request that rates nothing is a mistake, and
 * answering 200 to it would have the app showing a thank-you for nothing.
 */
export const submitReviewSchema = z
  .object({
    store: oneReviewSchema.optional(),
    driver: oneReviewSchema.optional(),
  })
  .strict()
  .refine((input) => input.store !== undefined || input.driver !== undefined, {
    message: 'Rate the kitchen, the driver, or both.',
  });

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

/** The id that makes a second submission the same submission. */
export function reviewId(orderId: string, target: ReviewTarget): string {
  return `${orderId}_${target}`;
}

export function toReview(snapshot: DocumentSnapshot): Review {
  const data = snapshot.data() ?? {};

  return {
    id: snapshot.id,
    orderId: toStringOr(data.orderId),
    target: (REVIEW_TARGETS as readonly string[]).includes(data.target)
      ? (data.target as ReviewTarget)
      : 'store',
    subjectId: toStringOr(data.subjectId),
    customerId: toStringOr(data.customerId),
    customerName: toStringOr(data.customerName),
    rating: toNumber(data.rating),
    comment: data.comment ? toStringOr(data.comment) : null,
    createdAt: toIso(data.createdAt),
  };
}

/**
 * An average that survives being added to a thousand times.
 *
 * Kept to two decimals so the stored number is the number everyone shows,
 * rather than each client rounding 4.333333333 its own way.
 */
export function addToAverage(
  current: number,
  count: number,
  rating: number,
): { rating: number; count: number } {
  const total = current * count + rating;
  const next = count + 1;
  return { rating: Math.round((total / next) * 100) / 100, count: next };
}
