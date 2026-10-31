/**
 * Who may review what.
 *
 * One rule carries the rest: you may review an order you paid for, once it
 * has been delivered, and nothing else. Reviews that anybody can write are
 * worth nothing to the next customer reading them, and a kitchen's rating is
 * the only thing on its page that the kitchen did not write itself.
 */

import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import type { AuthContext } from '../../middleware/auth';
import type { Page } from '../../lib/pagination';
import * as orderRepository from '../orders/order.repository';
import * as userRepository from '../users/user.repository';
import type { Review, SubmitReviewInput } from './review.model';
import * as repository from './review.repository';

const log = moduleLogger('reviews');

/**
 * Leave a review for the kitchen, the driver, or both.
 *
 * Partly accepted on purpose: a customer who rates both when the order had no
 * driver - picked up by the kitchen's own person, or an order whose driver
 * was never assigned - still gets their kitchen review recorded, rather than
 * a 422 that loses what they typed.
 */
export async function submit(
  caller: AuthContext,
  orderId: string,
  input: SubmitReviewInput,
): Promise<Review[]> {
  const order = await orderRepository.findById(orderId, 'customer');
  if (!order) throw ApiError.notFound('No such order.');

  if (order.customerId !== caller.uid) {
    // Reported as missing rather than forbidden: whether somebody else's
    // order exists is not this caller's business.
    throw ApiError.notFound('No such order.');
  }
  if (order.status !== 'delivered') {
    throw ApiError.conflict(
      'You can review this once it has been delivered.',
    );
  }

  const profile = await userRepository.findById(caller.uid);
  const customerName = profile?.displayName?.trim() || 'A customer';

  const written: Review[] = [];
  const skipped: string[] = [];

  /** Each half stands on its own: one failing must not lose the other. */
  const leave = async (
    target: 'store' | 'driver',
    subjectId: string,
    one: { rating: number; comment?: string },
  ) => {
    const outcome = await repository.write({
      orderId,
      target,
      subjectId,
      customerId: caller.uid,
      customerName,
      rating: one.rating,
      comment: one.comment?.trim() || null,
    });

    if ('written' in outcome) written.push(outcome.written);
    else skipped.push(outcome.skipped);
  };

  if (input.store) await leave('store', order.storeId, input.store);
  if (input.driver && order.driverId) {
    await leave('driver', order.driverId, input.driver);
  }

  // Nothing saved is the only case worth an error, and which error depends
  // on why: a repeat submission is the customer's mistake, a missing subject
  // is ours.
  if (written.length === 0) {
    if (skipped.includes('already_reviewed')) {
      throw ApiError.conflict('You have already reviewed this order.');
    }
    if (skipped.includes('no_such_subject')) {
      throw ApiError.notFound('There is nobody here to review.');
    }
  }

  log.info(
    {
      orderId,
      customerId: caller.uid,
      left: written.map((r) => r.target),
      skipped,
    },
    'Review left.',
  );

  return written;
}

/** What this customer has already said about an order, so the app can ask once. */
export async function forOrder(
  caller: AuthContext,
  orderId: string,
): Promise<Review[]> {
  const order = await orderRepository.findById(orderId, 'customer');
  if (!order || order.customerId !== caller.uid) {
    throw ApiError.notFound('No such order.');
  }

  return repository.findForOrder(orderId);
}

/** Public: what people said about a kitchen, or about a driver. */
export async function listFor(
  subjectId: string,
  options: { limit: number; cursor?: string },
): Promise<Page<Review>> {
  return repository.listFor(subjectId, options);
}
