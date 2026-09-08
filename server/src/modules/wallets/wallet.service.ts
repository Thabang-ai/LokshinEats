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

import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import { sumRands } from '../../lib/money';
import type { Page } from '../../lib/pagination';
import type { AuthContext } from '../../middleware/auth';
import type { LedgerEntry, Wallet } from './wallet.model';
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
}): Promise<void> {
  await repository.credit({
    walletId: input.vendorId,
    type: 'refund',
    amount: -Math.abs(input.vendorPayout),
    balance: 'pending',
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
export async function creditCustomer(input: {
  actor: AuthContext;
  customerId: string;
  amount: number;
  description: string;
  orderId?: string | null;
  type: 'refund' | 'bonus' | 'adjustment';
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
    // Admin credits are deliberate one-offs, so they must not collapse onto
    // an existing entry's id the way an automated settlement does.
    suffix: `manual_${Date.now()}`,
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
