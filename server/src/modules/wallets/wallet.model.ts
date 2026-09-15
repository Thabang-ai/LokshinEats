/**
 * Wallet domain model.
 *
 * Two records make up a wallet:
 *
 *   - `wallets/{uid}` holds the current balances. It is a running total, kept
 *     so a balance can be read without replaying history.
 *   - `walletTransactions/{id}` is an append-only ledger. Every movement of
 *     money writes one entry, and entries are never edited or deleted.
 *
 * The ledger is the source of truth and the balance is a cache of it. That
 * ordering matters: if the two ever disagree, the ledger is right, and the
 * balance can be rebuilt by summing it. A design that stored only the balance
 * would make an incorrect number impossible to explain after the fact.
 *
 * Balances are split in two because money is earned before it can be spent:
 *
 *   - `pendingBalance` — earned but not yet clearable. A vendor's share is
 *     pending while the order can still be cancelled or refunded.
 *   - `availableBalance` — cleared and withdrawable.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { toIso, toNumber, toStringOr } from '../../lib/serialize';

export type Wallet = {
  /** Same id as the owning user. */
  id: string;
  ownerId: string;
  availableBalance: number;
  pendingBalance: number;
  /** Convenience total; always availableBalance + pendingBalance. */
  totalBalance: number;
  currency: 'ZAR';
  updatedAt: string | null;
};

/**
 * Why money moved.
 *
 * `order_earning` covers a vendor's or driver's share of an order.
 * `commission` records the platform's own take, so the platform wallet is a
 * wallet like any other rather than an implied remainder.
 */
export const LEDGER_ENTRY_TYPES = [
  'order_earning',
  'commission',
  'refund',
  'bonus',
  'withdrawal',
  'adjustment',
  /**
   * Money the platform pays out beyond what a customer paid: a refund an
   * admin approved after the kitchen started, or a vendor or driver paid for
   * a cancelled order that was never paid for. Its own type so the expense
   * can be reported rather than hidden among adjustments.
   */
  'goodwill',
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export type LedgerEntry = {
  id: string;
  walletId: string;
  type: LedgerEntryType;
  /** Signed: positive credits the wallet, negative debits it. */
  amount: number;
  /** Which balance the entry landed in. */
  balance: 'available' | 'pending';
  /** The wallet's balance in that bucket immediately after this entry. */
  balanceAfter: number;
  orderId: string | null;
  paymentId: string | null;
  description: string;
  createdAt: string | null;
};

export const walletQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(200).optional(),
});

export type WalletQuery = z.infer<typeof walletQuerySchema>;

export const walletIdParamSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

/** Firestore document to API representation. */
export function toWallet(snapshot: DocumentSnapshot): Wallet {
  const data = snapshot.data() ?? {};

  const available = toNumber(data.availableBalance);
  const pending = toNumber(data.pendingBalance);

  return {
    id: snapshot.id,
    ownerId: toStringOr(data.ownerId, snapshot.id),
    availableBalance: available,
    pendingBalance: pending,
    totalBalance: Math.round((available + pending) * 100) / 100,
    currency: 'ZAR',
    updatedAt: toIso(data.updatedAt),
  };
}

/** A wallet that has no document yet reads as empty rather than missing. */
export function emptyWallet(ownerId: string): Wallet {
  return {
    id: ownerId,
    ownerId,
    availableBalance: 0,
    pendingBalance: 0,
    totalBalance: 0,
    currency: 'ZAR',
    updatedAt: null,
  };
}

export function toLedgerEntry(snapshot: DocumentSnapshot): LedgerEntry {
  const data = snapshot.data() ?? {};

  const type = LEDGER_ENTRY_TYPES.includes(data.type as LedgerEntryType)
    ? (data.type as LedgerEntryType)
    : 'adjustment';

  return {
    id: snapshot.id,
    walletId: toStringOr(data.walletId),
    type,
    amount: toNumber(data.amount),
    balance: data.balance === 'pending' ? 'pending' : 'available',
    balanceAfter: toNumber(data.balanceAfter),
    orderId: typeof data.orderId === 'string' ? data.orderId : null,
    paymentId: typeof data.paymentId === 'string' ? data.paymentId : null,
    description: toStringOr(data.description),
    createdAt: toIso(data.createdAt),
  };
}
