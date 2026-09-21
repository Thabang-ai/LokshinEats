/**
 * Payment business rules.
 *
 * The rule that matters: an order becomes paid only because the provider,
 * asked directly by this server, said the charge succeeded for the right
 * amount. Nothing a client sends can produce that outcome.
 *
 * The old web checkout did the opposite. It called a local function that
 * always resolved successfully after a timer, invented a transaction id, and
 * wrote `paymentStatus: 'paid'` onto the order itself.
 */

import { ApiError } from '../../lib/ApiError';
import { env } from '../../config/env';
import { moduleLogger } from '../../config/logger';
import { toCents } from '../../lib/money';
import type { Page } from '../../lib/pagination';
import type { AuthContext } from '../../middleware/auth';
import * as orderRepository from '../orders/order.repository';
import * as storeRepository from '../stores/store.repository';
import * as walletService from '../wallets/wallet.service';
import * as cancellationService from '../orders/cancellation.service';
import { automaticRefundAllowed, planGoodwillTopUp } from '../orders/cancellation.policy';
import type { OrderStatus } from '../orders/order.model';
import {
  getProvider,
  UnknownProviderError,
  type PaymentProvider,
} from './payment.provider';
import type {
  InitiatePaymentInput,
  ListPaymentsQuery,
  Payment,
} from './payment.model';
import * as repository from './payment.repository';

const log = moduleLogger('payments');

/** Resolve a provider by name, refusing anything not registered or not live. */
function resolveProvider(name?: string): PaymentProvider {
  const requested = name ?? env.PAYMENT_PROVIDER;

  try {
    return getProvider(requested);
  } catch (error) {
    if (error instanceof UnknownProviderError) {
      throw ApiError.unprocessable(
        `Payment provider "${requested}" is not available.`,
      );
    }
    throw error;
  }
}

/**
 * Start a charge for an order.
 *
 * The amount is read from the order, which the server priced. A client cannot
 * propose what it would like to pay.
 */
export async function initiatePayment(
  caller: AuthContext,
  input: InitiatePaymentInput,
): Promise<{ payment: Payment; redirectUrl: string | null; clientPayload: unknown }> {
  const order = await orderRepository.findRawById(input.orderId);
  if (!order) throw ApiError.notFound('No such order.');

  if (order.customerId !== caller.uid && caller.role !== 'admin') {
    // 404 rather than 403 so order ids cannot be probed.
    throw ApiError.notFound('No such order.');
  }

  if (order.paymentStatus === 'paid') {
    throw ApiError.conflict('This order has already been paid for.');
  }
  if (order.status === 'cancelled') {
    throw ApiError.conflict('This order was cancelled.');
  }
  if (order.paymentMethod === 'cash') {
    throw ApiError.unprocessable(
      'Cash orders are settled on delivery, not through a payment provider.',
    );
  }

  const provider = resolveProvider(input.provider);
  const amountCents = toCents(Number(order.total ?? 0), 'order total');

  if (amountCents <= 0) {
    throw ApiError.unprocessable('This order has no amount to charge.');
  }

  const intent = await provider.initiate({
    orderId: input.orderId,
    amountCents,
    currency: 'ZAR',
    customerEmail: caller.email,
    customerPhone: String(order.customerPhone ?? ''),
    returnUrl: env.PAYMENT_RETURN_URL ?? null,
  });

  const payment = await repository.create({
    orderId: input.orderId,
    customerId: String(order.customerId ?? caller.uid),
    amount: Number(order.total ?? 0),
    provider: provider.name,
    providerReference: intent.reference,
  });

  log.info(
    {
      paymentId: payment.id,
      orderId: input.orderId,
      provider: provider.name,
      amountCents,
    },
    'Payment initiated.',
  );

  return {
    payment,
    redirectUrl: intent.redirectUrl,
    clientPayload: intent.clientPayload,
  };
}

/**
 * Ask the provider what happened, then settle if it succeeded.
 *
 * Safe to call repeatedly. Verification is a read against the provider, and
 * wallet settlement is idempotent, so a client retry or a duplicate webhook
 * changes nothing the second time.
 */
export async function verifyPayment(
  caller: AuthContext,
  paymentId: string,
): Promise<Payment> {
  const payment = await repository.findById(paymentId);
  if (!payment) throw ApiError.notFound('No such payment.');

  if (payment.customerId !== caller.uid && caller.role !== 'admin') {
    throw ApiError.notFound('No such payment.');
  }

  // Already settled: return the record rather than re-verifying, so a client
  // polling after success is cheap and cannot re-trigger anything.
  if (payment.status === 'succeeded' || payment.status === 'partially_refunded') {
    return payment;
  }
  if (payment.status === 'refunded') {
    throw ApiError.conflict('This payment was refunded.');
  }

  if (!payment.providerReference) {
    throw ApiError.internal('Payment has no provider reference to verify.');
  }

  const provider = resolveProvider(payment.provider);
  const result = await provider.verify(payment.providerReference);

  if (result.status === 'pending') {
    // Not an error — the customer has not finished paying yet.
    return payment;
  }

  if (result.status === 'failed') {
    log.warn(
      { paymentId, orderId: payment.orderId, reason: result.reason },
      'Payment failed.',
    );
    await orderRepository.recordPayment(payment.orderId, 'failed', null);
    return repository.updateStatus(paymentId, 'failed', {
      failureReason: result.reason,
    });
  }

  // Succeeded. Before believing it, check the provider charged what the order
  // actually costs. A charge for the wrong amount is either a bug or an
  // attempt to pay R1 for a R500 order, and neither may settle.
  const order = await orderRepository.findRawById(payment.orderId);
  if (!order) throw ApiError.notFound('No such order.');

  const expectedCents = toCents(Number(order.total ?? 0), 'order total');

  if (result.amountCents !== expectedCents) {
    log.error(
      {
        paymentId,
        orderId: payment.orderId,
        expectedCents,
        capturedCents: result.amountCents,
      },
      'Captured amount does not match the order total; refusing to settle.',
    );

    await repository.updateStatus(paymentId, 'failed', {
      failureReason: 'Captured amount did not match the order total.',
    });
    throw ApiError.conflict(
      'The amount paid does not match this order. Support has been notified.',
    );
  }

  if (result.currency !== 'ZAR') {
    throw ApiError.conflict('This order can only be paid in rands.');
  }

  // Paid for after it was cancelled — the customer finished a checkout they
  // had already abandoned. There is nothing to cook or deliver, so the money
  // goes straight back to them instead of into the vendor's pending balance.
  if (order.status === 'cancelled') {
    await walletService.creditCustomer({
      actor: caller,
      customerId: payment.customerId,
      amount: payment.amount,
      description: `Refund for order ${payment.orderId}: paid after it was cancelled`,
      orderId: payment.orderId,
      type: 'refund',
      idempotencyKey: `late_payment_${paymentId}`,
    });
    await orderRepository.recordPayment(payment.orderId, 'refunded', result.transactionId);
    await orderRepository.recordRefund(payment.orderId, payment.amount, 'refunded');

    log.warn(
      { paymentId, orderId: payment.orderId },
      'Payment completed for a cancelled order; refunded to the customer.',
    );

    return repository.updateStatus(paymentId, 'refunded', {
      transactionId: result.transactionId,
      failureReason: null,
      refundedAmount: payment.amount,
    });
  }

  await settleOrder(payment.orderId, paymentId, result.transactionId);

  const updated = await repository.updateStatus(paymentId, 'succeeded', {
    transactionId: result.transactionId,
    failureReason: null,
  });

  log.info(
    { paymentId, orderId: payment.orderId, transactionId: result.transactionId },
    'Payment verified and settled.',
  );

  return updated;
}

/**
 * Mark the order paid and move money into wallets.
 *
 * The vendor's share lands in their pending balance and the platform's in
 * available. The driver is paid on delivery, not here.
 */
async function settleOrder(
  orderId: string,
  paymentId: string,
  transactionId: string,
): Promise<void> {
  const order = await orderRepository.findRawById(orderId);
  if (!order) throw ApiError.notFound('No such order.');

  const store = await storeRepository.findById(String(order.storeId ?? ''));
  if (!store) {
    // The money was captured, so this must be loud rather than silent.
    log.error({ orderId, storeId: order.storeId }, 'Cannot settle: store missing.');
    throw ApiError.internal('Could not settle this order. Support notified.');
  }

  await orderRepository.recordPayment(orderId, 'paid', transactionId);

  await walletService.settleOrderPayment({
    orderId,
    paymentId,
    vendorId: store.ownerId,
    vendorPayout: Number(order.vendorPayout ?? 0),
    platformEarnings: Number(order.platformEarnings ?? 0),
  });
}

/**
 * Settle a cash order at handover.
 *
 * Cash never touches a provider: the driver collects it and the platform's
 * share is reconciled against the driver rather than captured from a card.
 * The wallet entries are the same shape so reporting does not have to care
 * how an order was paid for.
 */
export async function settleCashOrder(orderId: string): Promise<void> {
  const order = await orderRepository.findRawById(orderId);
  if (!order) throw ApiError.notFound('No such order.');

  if (order.paymentMethod !== 'cash') return;
  if (order.paymentStatus === 'paid') return;

  const store = await storeRepository.findById(String(order.storeId ?? ''));
  if (!store) {
    log.error({ orderId }, 'Cannot settle cash order: store missing.');
    return;
  }

  await orderRepository.recordPayment(orderId, 'paid', null);

  await walletService.settleOrderPayment({
    orderId,
    paymentId: null,
    vendorId: store.ownerId,
    vendorPayout: Number(order.vendorPayout ?? 0),
    platformEarnings: Number(order.platformEarnings ?? 0),
  });
}

/**
 * Pay the driver and release the vendor's funds once delivery is confirmed.
 * Called by the orders module after the delivery code has been verified.
 */
export async function settleDelivery(orderId: string): Promise<void> {
  const order = await orderRepository.findRawById(orderId);
  if (!order) return;

  const driverId = order.driverId ? String(order.driverId) : null;
  if (!driverId) return;

  const store = await storeRepository.findById(String(order.storeId ?? ''));
  if (!store) {
    log.error({ orderId }, 'Cannot settle delivery: store missing.');
    return;
  }

  // A cash order is only paid for at this moment, so settle it first.
  if (order.paymentMethod === 'cash' && order.paymentStatus !== 'paid') {
    await settleCashOrder(orderId);
  }

  await walletService.settleDelivery({
    orderId,
    vendorId: store.ownerId,
    vendorPayout: Number(order.vendorPayout ?? 0),
    driverId,
    driverPayout: Number(order.driverPayout ?? 0),
  });

  // The earnings above are the same for card and cash. On a cash order the
  // money itself is in the driver's pocket rather than the platform's, and
  // the ledger has to say so, or the kitchen and driver are paid twice: once
  // in cash, once again in their wallets.
  if (order.paymentMethod === 'cash') {
    await walletService.recordCashCollected({
      orderId,
      driverId,
      total: Number(order.total ?? 0),
    });
  }
}

/**
 * Refund a payment, within the cancellation tiers.
 *
 * Before the kitchen starts, a refund is automatic: the order is cancelled
 * under the policy, which returns everything and pays nobody.
 *
 * From then on — in preparation, on the way, or delivered — a refund would
 * come out of food a vendor has already made or a trip a driver has already
 * taken, so it is refused unless an admin approves it as goodwill. A goodwill
 * refund first closes the order under the normal tier (so the vendor and
 * driver are paid what they are owed), then tops the customer up to what they
 * paid out of the platform wallet, recorded as a goodwill expense.
 *
 * Every money movement is keyed to the order, and the payment is marked
 * refunded last, so an interrupted refund is safe to run again.
 */
export async function refundPayment(
  actor: AuthContext,
  paymentId: string,
  reason: string,
  options: { goodwill?: boolean } = {},
): Promise<Payment> {
  const payment = await repository.findById(paymentId);
  if (!payment) throw ApiError.notFound('No such payment.');

  if (payment.status === 'refunded') {
    throw ApiError.conflict('This payment has already been refunded in full.');
  }
  if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') {
    throw ApiError.conflict('Only a successful payment can be refunded.');
  }

  const order = await orderRepository.findRawById(payment.orderId);
  if (!order) throw ApiError.notFound('No such order.');

  const status = String(order.status ?? 'pending') as OrderStatus;

  // Before prep: the ordinary policy already gives a full refund.
  if (automaticRefundAllowed(status)) {
    await cancellationService.cancelOrder({
      actor,
      orderId: payment.orderId,
      audience: 'admin',
      reason,
    });

    log.warn({ actor: actor.uid, paymentId, orderId: payment.orderId, reason }, 'Payment refunded.');
    const refunded = await repository.findById(paymentId);
    if (!refunded) throw ApiError.notFound('No such payment.');
    return refunded;
  }

  if (!options.goodwill) {
    throw ApiError.conflict(
      status === 'cancelled'
        ? 'This order was cancelled under the cancellation policy. Refunding more than that needs to be approved as goodwill, paid for by the platform.'
        : 'Preparation has already started on this order, so it cannot be refunded automatically. Approve it as goodwill to refund it at the platform\u2019s expense.',
    );
  }

  // Goodwill. Close the order under its normal tier first, so the vendor and
  // driver are paid what the policy owes them — or finish a cancellation
  // that was interrupted before its refund was recorded.
  if (status !== 'delivered') {
    await cancellationService.ensureCancelled({
      actor,
      orderId: payment.orderId,
      reason,
    });
  }

  const current = await orderRepository.findRawById(payment.orderId);
  const alreadyRefunded = Number(current?.refundedAmount ?? 0);
  const topUp = planGoodwillTopUp(payment.amount, alreadyRefunded);

  await walletService.goodwillRefund({
    actor,
    orderId: payment.orderId,
    customerId: payment.customerId,
    amount: topUp,
    reason,
  });

  await orderRepository.recordRefund(payment.orderId, payment.amount, 'refunded');

  log.warn(
    { actor: actor.uid, paymentId, orderId: payment.orderId, reason, goodwill: topUp },
    'Payment refunded as goodwill.',
  );

  return repository.updateStatus(paymentId, 'refunded', { refundedAmount: payment.amount });
}

export async function getPayment(
  caller: AuthContext,
  paymentId: string,
): Promise<Payment> {
  const payment = await repository.findById(paymentId);
  if (!payment) throw ApiError.notFound('No such payment.');

  if (payment.customerId !== caller.uid && caller.role !== 'admin') {
    throw ApiError.notFound('No such payment.');
  }

  return payment;
}

export async function listOwnPayments(
  caller: AuthContext,
  query: ListPaymentsQuery,
): Promise<Page<Payment>> {
  return repository.listForCustomer(caller.uid, query);
}

export async function listAllPayments(
  query: ListPaymentsQuery,
): Promise<Page<Payment>> {
  return repository.listAll(query);
}
