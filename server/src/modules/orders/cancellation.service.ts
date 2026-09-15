/**
 * Cancelling an order and settling what it costs.
 *
 * The policy (cancellation.policy.ts) decides who gets what; this module
 * carries it out, in an order chosen so an interruption never leaves an
 * order open with its money given back:
 *
 *   1. Cancel the order in a transaction that also records the plan, worked
 *      out from the status that write applies to.
 *   2. Move the money. Every entry is keyed to the order, so repeating it
 *      writes nothing new.
 *   3. Record the refund on the order and payment, and mark the plan settled.
 *
 * If step 2 or 3 fails, asking to cancel again finds the stored, unsettled
 * plan and finishes it.
 */

import { env } from '../../config/env';
import { moduleLogger } from '../../config/logger';
import { ApiError } from '../../lib/ApiError';
import type { AuthContext } from '../../middleware/auth';
import * as paymentRepository from '../payments/payment.repository';
import * as storeRepository from '../stores/store.repository';
import * as walletService from '../wallets/wallet.service';
import {
  planCancellation,
  type CancellationInitiator,
  type CancellationPlan,
} from './cancellation.policy';
import type { Audience, Order, OrderStatus } from './order.model';
import * as repository from './order.repository';

const log = moduleLogger('cancellations');

function initiatorFor(role: AuthContext['role']): CancellationInitiator {
  if (role === 'customer' || role === 'vendor' || role === 'admin') return role;
  // A driver gives an order back with release, and is never the one who
  // decides what a cancellation costs.
  throw ApiError.forbidden('Drivers cannot cancel orders. Release the order instead.');
}

/**
 * Cancel an order under the policy for whoever is asking.
 *
 * The caller has already proven their relationship to the order.
 */
export async function cancelOrder(input: {
  actor: AuthContext;
  orderId: string;
  audience: Audience;
  reason?: string;
}): Promise<Order> {
  const initiator = initiatorFor(input.actor.role);

  const { cancelledNow, plan } = await repository.cancelOrder(
    input.orderId,
    input.actor.role,
    (order) =>
      planCancellation({
        status: String(order.status ?? 'pending') as OrderStatus,
        initiator,
        paymentMethod: String(order.paymentMethod ?? 'cash'),
        paymentStatus: String(order.paymentStatus ?? 'pending'),
        driverAssigned: Boolean(order.driverId),
        total: Number(order.total ?? 0),
        vendorPayout: Number(order.vendorPayout ?? 0),
        driverPayout: Number(order.driverPayout ?? 0),
        platformEarnings: Number(order.platformEarnings ?? 0),
        arrivalFeeShare: env.DRIVER_ARRIVAL_FEE_SHARE,
      }),
  );

  await settle(input.orderId, plan, input.reason ?? `cancelled by the ${plan.initiator}`, input.actor);

  log.info(
    {
      orderId: input.orderId,
      actor: input.actor.uid,
      stage: plan.stage,
      customerRefund: plan.customerRefund,
      vendorPay: plan.vendorPay,
      driverPay: plan.driverPay,
      goodwill: plan.goodwill,
      resumed: !cancelledNow,
    },
    cancelledNow ? 'Order cancelled.' : 'Finished an interrupted cancellation.',
  );

  const order = await repository.findById(input.orderId, input.audience);
  if (!order) throw ApiError.notFound('No such order.');
  return order;
}

/**
 * Make sure an order is cancelled and its cancellation settled.
 *
 * For an admin's goodwill refund: cancels an open order under the admin tier,
 * finishes an interrupted cancellation, and is a no-op for one already
 * settled — so the goodwill top-up is always worked out from a recorded
 * refund, never from a half-finished one.
 */
export async function ensureCancelled(input: {
  actor: AuthContext;
  orderId: string;
  reason: string;
}): Promise<void> {
  const order = await repository.findRawById(input.orderId);
  if (!order) throw ApiError.notFound('No such order.');

  const cancellation = order.cancellation as { settled?: boolean } | undefined;
  if (order.status === 'cancelled' && (!cancellation || cancellation.settled === true)) {
    return;
  }

  await cancelOrder({ ...input, audience: 'admin' });
}

async function settle(
  orderId: string,
  plan: CancellationPlan,
  reason: string,
  actor: AuthContext,
): Promise<void> {
  const order = await repository.findRawById(orderId);
  if (!order) throw ApiError.notFound('No such order.');

  const store = await storeRepository.findById(String(order.storeId ?? ''));
  if (!store) {
    // The order is cancelled and money may be owed; this has to be loud.
    log.error({ orderId, storeId: order.storeId }, 'Cannot settle cancellation: store missing.');
    throw ApiError.internal('Could not settle this cancellation. Support has been notified.');
  }

  await walletService.applyCancellation({
    orderId,
    vendorId: store.ownerId,
    driverId: order.driverId ? String(order.driverId) : null,
    vendorPayout: Number(order.vendorPayout ?? 0),
    reason,
    plan,
  });

  if (plan.customerRefund > 0) {
    await walletService.creditCustomer({
      actor,
      customerId: String(order.customerId ?? ''),
      amount: plan.customerRefund,
      description: `Refund for cancelled order ${orderId}`,
      orderId,
      type: 'refund',
      idempotencyKey: 'cancellation',
    });
  }

  const totalCents = Math.round(Number(order.total ?? 0) * 100);
  const refundCents = Math.round(plan.customerRefund * 100);
  const paymentStatus =
    refundCents <= 0 ? undefined : refundCents >= totalCents ? 'refunded' : 'partially_refunded';

  if (plan.prepaid && paymentStatus) {
    const payment = await paymentRepository.findLatestForOrder(orderId);
    if (payment && (payment.status === 'succeeded' || payment.status === 'partially_refunded')) {
      await paymentRepository.updateStatus(payment.id, paymentStatus, {
        refundedAmount: plan.customerRefund,
      });
    }
  }

  await repository.markCancellationSettled(orderId, plan.customerRefund, paymentStatus);
}
