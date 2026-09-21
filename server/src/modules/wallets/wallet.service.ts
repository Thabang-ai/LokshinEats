/**
 * Wallet business rules.
 *
 * This module owns the only writes to wallet balances. Nothing else in the
 * codebase touches them, which is what makes the ledger a complete record: if
 * money moved, an entry here explains it.
 *
 * The platform's own earnings live in a wallet too, under a reserved id,
 * rather than being inferred as "whatever is left over". Treating the
 * platform as one more participant means a settlement either balances or
 * visibly does not.
 */

import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import { sumRands } from '../../lib/money';
import type { Page } from '../../lib/pagination';
import type { AuthContext } from '../../middleware/auth';
import type { LedgerEntry, Wallet } from './wallet.model';
import * as userRepository from '../users/user.repository';
import * as repository from './wallet.repository';

const log = moduleLogger('wallets');

/** Reserved wallet id holding platform commission and delivery share. */
export const PLATFORM_WALLET_ID = 'platform';

export async function getOwnWallet(caller: AuthContext): Promise<Wallet> {
  return repository.findByOwner(caller.uid);
}

export async function listOwnTransactions(
  caller: AuthContext,
  options: { limit: number; cursor?: string },
): Promise<Page<LedgerEntry>> {
  return repository.listEntries(caller.uid, options);
}

export async function getWalletAsAdmin(walletId: string): Promise<Wallet> {
  return repository.findByOwner(walletId);
}

export async function listTransactionsAsAdmin(
  walletId: string,
  options: { limit: number; cursor?: string },
): Promise<Page<LedgerEntry>> {
  return repository.listEntries(walletId, options);
}

export type OrderSettlement = {
  orderId: string;
  paymentId: string | null;
  vendorId: string;
  vendorPayout: number;
  platformEarnings: number;
  /** Absent until a driver has been assigned and has delivered. */
  driverId?: string | null;
  driverPayout?: number;
};

/**
 * Credit the vendor and the platform when an order is paid for.
 *
 * The vendor's share lands in `pending`, not `available`. The order can still
 * be cancelled or refunded at this point, and paying out money that may have
 * to be clawed back is how a platform ends up chasing vendors for refunds.
 *
 * The driver is not paid here. They are paid on delivery, because that is
 * when they have actually earned it — see `settleDriverEarnings`.
 *
 * Idempotent: replaying a payment verification writes the same ledger ids and
 * changes nothing.
 */
export async function settleOrderPayment(
  settlement: OrderSettlement,
): Promise<{ applied: boolean }> {
  const vendorResult = await repository.credit({
    walletId: settlement.vendorId,
    type: 'order_earning',
    amount: settlement.vendorPayout,
    balance: 'pending',
    description: `Order ${settlement.orderId} — food subtotal less commission`,
    orderId: settlement.orderId,
    paymentId: settlement.paymentId,
  });

  const platformResult = await repository.credit({
    walletId: PLATFORM_WALLET_ID,
    type: 'commission',
    amount: settlement.platformEarnings,
    balance: 'available',
    description: `Order ${settlement.orderId} — commission and delivery share`,
    orderId: settlement.orderId,
    paymentId: settlement.paymentId,
  });

  const applied = vendorResult.applied || platformResult.applied;

  if (applied) {
    log.info(
      {
        orderId: settlement.orderId,
        vendorId: settlement.vendorId,
        vendorPayout: settlement.vendorPayout,
        platformEarnings: settlement.platformEarnings,
      },
      'Order payment settled.',
    );
  } else {
    log.debug(
      { orderId: settlement.orderId },
      'Settlement replayed; already applied.',
    );
  }

  return { applied };
}

/**
 * Credit the driver and clear the vendor's pending balance on delivery.
 *
 * Called once the delivery code has been verified, so the money only moves
 * after the handover actually happened.
 */
export async function settleDelivery(input: {
  orderId: string;
  vendorId: string;
  vendorPayout: number;
  driverId: string;
  driverPayout: number;
}): Promise<void> {
  await repository.credit({
    walletId: input.driverId,
    type: 'order_earning',
    amount: input.driverPayout,
    balance: 'available',
    description: `Order ${input.orderId} — delivery earnings`,
    orderId: input.orderId,
  });

  await repository.clearPending({
    walletId: input.vendorId,
    amount: input.vendorPayout,
    description: `Order ${input.orderId} — delivered, funds released`,
    orderId: input.orderId,
  });

  log.info(
    {
      orderId: input.orderId,
      driverId: input.driverId,
      driverPayout: input.driverPayout,
    },
    'Delivery settled.',
  );
}

/**
 * Reverse an order's settlement.
 *
 * Written as new compensating entries rather than by deleting the originals.
 * A ledger that can be edited is not a ledger, and a refunded order should
 * still show what was earned and then given back.
 */
export async function reverseOrderSettlement(input: {
  orderId: string;
  vendorId: string;
  vendorPayout: number;
  platformEarnings: number;
  reason: string;
  /**
   * Where the vendor's share currently sits. It lands in `pending` when the
   * order is paid and moves to `available` on delivery, so a refund after
   * delivery has to take it back from `available`. Debiting `pending` there
   * left the vendor holding the money and showing a negative pending balance.
   */
  vendorBalance: 'pending' | 'available';
}): Promise<void> {
  await repository.credit({
    walletId: input.vendorId,
    type: 'refund',
    amount: -Math.abs(input.vendorPayout),
    balance: input.vendorBalance,
    description: `Order ${input.orderId} — reversed: ${input.reason}`,
    orderId: input.orderId,
    suffix: 'reversal',
  });

  await repository.credit({
    walletId: PLATFORM_WALLET_ID,
    type: 'refund',
    amount: -Math.abs(input.platformEarnings),
    balance: 'available',
    description: `Order ${input.orderId} — reversed: ${input.reason}`,
    orderId: input.orderId,
    suffix: 'reversal',
  });

  log.warn(
    { orderId: input.orderId, reason: input.reason },
    'Order settlement reversed.',
  );
}

/**
 * Credit a customer, for a refund or a promotional balance.
 *
 * Admin-initiated only. Lands in `available` because there is nothing further
 * to wait for.
 */
/**
 * Credit a wallet on one side only.
 *
 * Single-entry by design, and for internal use: every caller balances it
 * elsewhere. A cancellation refund is matched by the vendor and platform
 * reversals the cancellation writes; a late payment refunded is the
 * customer's own money going back. An admin giving money that nobody paid in
 * must not come through here - that is {@link manualCredit}, which takes it
 * from the platform.
 */
export async function creditCustomer(input: {
  actor: AuthContext;
  customerId: string;
  amount: number;
  description: string;
  orderId?: string | null;
  type: 'refund' | 'bonus' | 'adjustment';
  /**
   * Makes the credit safe to repeat: the same key always writes the same
   * ledger entry, so a retried refund cannot credit the customer twice.
   * Left out for one-off admin credits, where two identical goodwill credits
   * are two credits.
   */
  idempotencyKey?: string;
}): Promise<Wallet> {
  if (input.amount <= 0) {
    throw ApiError.unprocessable('Credit amount must be positive.');
  }

  await repository.credit({
    walletId: input.customerId,
    type: input.type,
    amount: input.amount,
    balance: 'available',
    description: input.description,
    orderId: input.orderId ?? null,
    // Admin credits are deliberate one-offs, so without a key they must not
    // collapse onto an existing entry's id the way an automated settlement
    // does. A refund passes its payment id, so a retry lands on the same
    // entry instead of a second one.
    suffix: input.idempotencyKey ?? `manual_${Date.now()}`,
  });

  log.warn(
    {
      actor: input.actor.uid,
      customerId: input.customerId,
      amount: input.amount,
      type: input.type,
    },
    'Manual wallet credit.',
  );

  return repository.findByOwner(input.customerId);
}

/**
 * Sum a set of amounts the way the ledger does.
 * Exposed so reporting cannot reintroduce floating-point drift.
 */
export function total(amounts: readonly number[]): number {
  return sumRands(amounts);
}

/**
 * Carry out the wallet side of a cancellation plan.
 *
 * Every entry is keyed to the order, so running this again — to finish a
 * cancellation that was interrupted — writes nothing twice. The customer's
 * refund is credited separately by the caller, keyed the same way.
 */
export async function applyCancellation(input: {
  orderId: string;
  vendorId: string;
  driverId: string | null;
  /** The vendor's share recorded on the order, reversed when the plan says so. */
  vendorPayout: number;
  reason: string;
  plan: {
    vendorSettlement: 'none' | 'reverse' | 'release' | 'credit';
    vendorPay: number;
    driverPay: number;
    platformReversal: number;
    goodwill: number;
  };
}): Promise<void> {
  const { orderId, plan } = input;

  if (plan.vendorSettlement === 'reverse' && input.vendorPayout > 0) {
    await repository.credit({
      walletId: input.vendorId,
      type: 'refund',
      amount: -Math.abs(input.vendorPayout),
      balance: 'pending',
      description: `Order ${orderId} — cancelled before preparation: ${input.reason}`,
      orderId,
      suffix: 'reversal',
    });
  }

  if (plan.vendorSettlement === 'release' && plan.vendorPay > 0) {
    await repository.clearPending({
      walletId: input.vendorId,
      amount: plan.vendorPay,
      description: `Order ${orderId} — cancelled after preparation began; paid for the food`,
      orderId,
    });
  }

  if (plan.vendorSettlement === 'credit' && plan.vendorPay > 0) {
    await repository.credit({
      walletId: input.vendorId,
      type: 'order_earning',
      amount: plan.vendorPay,
      balance: 'available',
      description: `Order ${orderId} — cancelled after preparation began; food paid for by LokshinEats`,
      orderId,
      suffix: 'cancellation',
    });
  }

  if (plan.platformReversal > 0) {
    await repository.credit({
      walletId: PLATFORM_WALLET_ID,
      type: 'refund',
      amount: -Math.abs(plan.platformReversal),
      balance: 'available',
      description: `Order ${orderId} — cancelled: ${input.reason}`,
      orderId,
      suffix: 'reversal',
    });
  }

  if (plan.driverPay > 0 && input.driverId) {
    await repository.credit({
      walletId: input.driverId,
      type: 'order_earning',
      amount: plan.driverPay,
      balance: 'available',
      description: `Order ${orderId} — cancelled after you were dispatched`,
      orderId,
      suffix: 'cancellation',
    });
  }

  if (plan.goodwill > 0) {
    await repository.credit({
      walletId: PLATFORM_WALLET_ID,
      type: 'goodwill',
      amount: -Math.abs(plan.goodwill),
      balance: 'available',
      description: `Order ${orderId} — platform-covered cancellation: ${input.reason}`,
      orderId,
      suffix: 'cancellation_goodwill',
    });
  }

  log.info(
    { orderId, vendorSettlement: plan.vendorSettlement, driverPay: plan.driverPay, goodwill: plan.goodwill },
    'Cancellation settled.',
  );
}

/**
 * Refund a customer at the platform's expense.
 *
 * Used when an admin approves a refund the cancellation policy would not give
 * — after the kitchen started, or after delivery. The vendor and driver keep
 * what they were paid; the platform wallet carries the cost as a goodwill
 * entry, so the expense is visible rather than folded into someone else's
 * balance. Keyed to the order, so a retry does not refund twice.
 */
export async function goodwillRefund(input: {
  actor: AuthContext;
  orderId: string;
  customerId: string;
  amount: number;
  reason: string;
}): Promise<void> {
  if (input.amount <= 0) return;

  await repository.credit({
    walletId: PLATFORM_WALLET_ID,
    type: 'goodwill',
    amount: -Math.abs(input.amount),
    balance: 'available',
    description: `Order ${input.orderId} — goodwill refund: ${input.reason}`,
    orderId: input.orderId,
    suffix: 'goodwill_refund',
  });

  await creditCustomer({
    actor: input.actor,
    customerId: input.customerId,
    amount: input.amount,
    description: `Goodwill refund for order ${input.orderId}: ${input.reason}`,
    orderId: input.orderId,
    type: 'refund',
    idempotencyKey: 'goodwill_refund',
  });

  log.warn(
    { actor: input.actor.uid, orderId: input.orderId, amount: input.amount },
    'Goodwill refund approved.',
  );
}

/**
 * An admin paying someone money that no order paid in: an apology credit, a
 * promotional balance, a correction.
 *
 * It is the platform paying, so it is booked as the platform paying: a
 * goodwill debit on the platform wallet and a credit on the recipient's,
 * written together in one transaction. Before this, the credit landed on the
 * recipient alone - money that appeared from nowhere, with no expense against
 * it, so the platform wallet overstated what it had by every credit ever
 * made. The cancellation rules already require any admin exception to be a
 * platform-covered goodwill expense; this makes the manual credit one.
 */
export async function manualCredit(input: {
  actor: AuthContext;
  recipientId: string;
  amount: number;
  description: string;
  orderId?: string | null;
  type: 'refund' | 'bonus' | 'adjustment';
}): Promise<Wallet> {
  if (input.amount <= 0) {
    throw ApiError.unprocessable('Credit amount must be positive.');
  }

  if (input.recipientId === PLATFORM_WALLET_ID) {
    // Paying the platform from the platform moves nothing and would put a
    // goodwill expense on the books for money that never left.
    throw ApiError.unprocessable('The platform cannot credit itself.');
  }

  // A wallet is created on first credit, so without this an id with a typo
  // would open a wallet for nobody and pay money into it.
  if (!(await userRepository.exists(input.recipientId))) {
    throw ApiError.notFound('No account with that id.');
  }

  await repository.transfer({
    from: {
      walletId: PLATFORM_WALLET_ID,
      type: 'goodwill',
      description: `Manual ${input.type} to ${input.recipientId}: ${input.description}`,
    },
    to: {
      walletId: input.recipientId,
      type: input.type,
      description: input.description,
    },
    amount: input.amount,
    orderId: input.orderId ?? null,
    // Admin credits are deliberate one-offs, so two identical ones are two
    // credits; the pair shares this key so it is never half-written.
    suffix: `manual_${randomUUID()}`,
  });

  log.warn(
    {
      actor: input.actor.uid,
      recipientId: input.recipientId,
      amount: input.amount,
      type: input.type,
    },
    'Manual credit paid from the platform as goodwill.',
  );

  return repository.findByOwner(input.recipientId);
}
