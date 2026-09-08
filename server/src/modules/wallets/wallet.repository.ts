/**
 * Wallet persistence.
 *
 * Every credit and debit writes the ledger entry and updates the balance in
 * one Firestore transaction. Splitting them would allow a crash between the
 * two writes to leave a balance that no ledger explains, or money earned that
 * no balance reflects.
 *
 * Credits are idempotent by construction. The ledger entry's document id is
 * derived from what caused it — order, wallet, and reason — so replaying a
 * settlement writes to the same id and the transaction sees it already
 * exists. That matters because payment verification can legitimately run more
 * than once: a client retry, a duplicate provider webhook, or an operator
 * re-running a stuck order should never pay a vendor twice.
 */

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import { moduleLogger } from '../../config/logger';
import { toCents, toRands } from '../../lib/money';
import { buildPage, type Page } from '../../lib/pagination';
import {
  emptyWallet,
  toLedgerEntry,
  toWallet,
  type LedgerEntry,
  type LedgerEntryType,
  type Wallet,
} from './wallet.model';

const log = moduleLogger('wallets:repository');

const wallets = () => db.collection(Collections.wallets);
const ledger = () => db.collection(Collections.walletTransactions);

/**
 * Deterministic ledger id.
 *
 * Firestore document ids may not contain "/", and the parts here are ids and
 * fixed keywords, so a simple join is safe.
 */
function ledgerId(parts: {
  walletId: string;
  type: LedgerEntryType;
  orderId?: string | null;
  suffix?: string;
}): string {
  return [parts.orderId ?? 'noorder', parts.walletId, parts.type, parts.suffix]
    .filter((part): part is string => Boolean(part))
    .join('__');
}

export async function findByOwner(ownerId: string): Promise<Wallet> {
  const snapshot = await wallets().doc(ownerId).get();
  // A user who has never earned anything has no document yet; that is an
  // empty wallet, not a missing one.
  return snapshot.exists ? toWallet(snapshot) : emptyWallet(ownerId);
}

export type CreditInput = {
  walletId: string;
  type: LedgerEntryType;
  /** Positive to credit, negative to debit. */
  amount: number;
  balance: 'available' | 'pending';
  description: string;
  orderId?: string | null;
  paymentId?: string | null;
  /** Distinguishes two entries that would otherwise collide. */
  suffix?: string;
};

export type CreditResult = {
  /** False when this exact entry had already been written. */
  applied: boolean;
  entryId: string;
};

/**
 * Move money into or out of a wallet, atomically with its ledger entry.
 *
 * Deliberately owns its own transaction rather than accepting one. Firestore
 * requires every read in a transaction to happen before any write, and this
 * function reads. Composing two of these inside one caller-supplied
 * transaction therefore fails at runtime — which is exactly how the original
 * `clearPending` was written, and why it now does its own reads up front
 * instead of calling this twice.
 */
export async function credit(input: CreditInput): Promise<CreditResult> {
  const entryId = ledgerId(input);
  const entryRef = ledger().doc(entryId);
  const walletRef = wallets().doc(input.walletId);

  return db.runTransaction(async (tx: Transaction): Promise<CreditResult> => {
    // Firestore requires every read in a transaction to happen before any
    // write, so both reads come first.
    const [existing, walletSnapshot] = await Promise.all([
      tx.get(entryRef),
      tx.get(walletRef),
    ]);

    if (existing.exists) {
      // Already settled. Returning rather than throwing keeps a replayed
      // webhook a no-op instead of an error the provider will retry.
      return { applied: false, entryId };
    }

    const field =
      input.balance === 'pending' ? 'pendingBalance' : 'availableBalance';

    const currentCents = walletSnapshot.exists
      ? toCents(
          Number(walletSnapshot.get(field) ?? 0),
          `${input.walletId} ${field}`,
        )
      : 0;

    const deltaCents = Math.round(input.amount * 100);
    const nextCents = currentCents + deltaCents;
    const balanceAfter = toRands(nextCents);

    if (walletSnapshot.exists) {
      tx.update(walletRef, {
        [field]: balanceAfter,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(walletRef, {
        ownerId: input.walletId,
        availableBalance: field === 'availableBalance' ? balanceAfter : 0,
        pendingBalance: field === 'pendingBalance' ? balanceAfter : 0,
        currency: 'ZAR',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    tx.set(entryRef, {
      walletId: input.walletId,
      type: input.type,
      amount: toRands(deltaCents),
      balance: input.balance,
      balanceAfter,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      description: input.description,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { applied: true, entryId };
  });
}

/**
 * Move money from pending to available.
 *
 * Written as two ledger entries rather than one silent balance edit, so the
 * history explains where the money went and where it arrived.
 */
export async function clearPending(input: {
  walletId: string;
  amount: number;
  description: string;
  orderId?: string | null;
}): Promise<CreditResult> {
  const base = {
    walletId: input.walletId,
    type: 'adjustment' as const,
    orderId: input.orderId ?? null,
  };

  const outRef = ledger().doc(ledgerId({ ...base, suffix: 'clear_out' }));
  const inRef = ledger().doc(ledgerId({ ...base, suffix: 'clear_in' }));
  const walletRef = wallets().doc(input.walletId);

  return db.runTransaction(async (tx: Transaction): Promise<CreditResult> => {
    // Every read first — Firestore rejects a transaction that reads after it
    // has written, which is why this cannot be two `credit` calls.
    const [outSnapshot, inSnapshot, walletSnapshot] = await Promise.all([
      tx.get(outRef),
      tx.get(inRef),
      tx.get(walletRef),
    ]);

    // The pair is written in one transaction and cannot half-exist, so
    // either entry being present means the move already happened.
    if (outSnapshot.exists || inSnapshot.exists) {
      return { applied: false, entryId: inRef.id };
    }

    const amountCents = Math.round(Math.abs(input.amount) * 100);

    const pendingCents = walletSnapshot.exists
      ? toCents(
          Number(walletSnapshot.get('pendingBalance') ?? 0),
          `${input.walletId} pendingBalance`,
        )
      : 0;
    const availableCents = walletSnapshot.exists
      ? toCents(
          Number(walletSnapshot.get('availableBalance') ?? 0),
          `${input.walletId} availableBalance`,
        )
      : 0;

    const nextPending = toRands(pendingCents - amountCents);
    const nextAvailable = toRands(availableCents + amountCents);

    if (nextPending < 0) {
      // Releasing more than was ever held means an earlier settlement did not
      // run. The move still happens so the recipient is not short-paid, but
      // the negative balance is left visible rather than clamped to zero,
      // because a silently corrected balance is one nobody investigates.
      log.error(
        {
          walletId: input.walletId,
          orderId: input.orderId,
          requested: input.amount,
          pendingBefore: toRands(pendingCents),
        },
        'Clearing more than the pending balance held; wallet needs review.',
      );
    }

    if (walletSnapshot.exists) {
      tx.update(walletRef, {
        pendingBalance: nextPending,
        availableBalance: nextAvailable,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(walletRef, {
        ownerId: input.walletId,
        pendingBalance: nextPending,
        availableBalance: nextAvailable,
        currency: 'ZAR',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const shared = {
      walletId: input.walletId,
      type: 'adjustment',
      orderId: input.orderId ?? null,
      paymentId: null,
      description: input.description,
      createdAt: FieldValue.serverTimestamp(),
    };

    tx.set(outRef, {
      ...shared,
      amount: toRands(-amountCents),
      balance: 'pending',
      balanceAfter: nextPending,
    });

    tx.set(inRef, {
      ...shared,
      amount: toRands(amountCents),
      balance: 'available',
      balanceAfter: nextAvailable,
    });

    return { applied: true, entryId: inRef.id };
  });
}

export async function listEntries(
  walletId: string,
  options: { limit: number; cursor?: string },
): Promise<Page<LedgerEntry>> {
  let query = ledger()
    .where('walletId', '==', walletId)
    .orderBy('createdAt', 'desc');

  if (options.cursor) {
    const cursorDoc = await ledger().doc(options.cursor).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc);
  }

  const snapshot = await query.limit(options.limit + 1).get();
  return buildPage(snapshot.docs.map(toLedgerEntry), options.limit);
}
