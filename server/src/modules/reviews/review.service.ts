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

  if (input.store) {
    written.push(
      await repository.write({
        orderId,
        target: 'store',
        subjectId: order.storeId,
        customerId: caller.uid,
        customerName,
        rating: input.store.rating,
        comment: input.store.comment?.trim() || null,
      }),
    );
  }

  if (input.driver && order.driverId) {
    written.push(
      await repository.write({
        orderId,
        target: 'driver',
        subjectId: order.driverId,
        customerId: caller.uid,
        customerName,
        rating: input.driver.rating,
        comment: input.driver.comment?.trim() || null,
      }),
    );
  }

  log.info(
    { orderId, customerId: caller.uid, left: written.map((r) => r.target) },
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
