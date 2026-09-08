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
 * Runs inside `transaction` when one is supplied, so a caller settling
 * several wallets at once gets all-or-nothing behaviour across them.
 */
export async function credit(
  input: CreditInput,
  transaction?: Transaction,
): Promise<CreditResult> {
  const entryId = ledgerId(input);
  const entryRef = ledger().doc(entryId);
  const walletRef = wallets().doc(input.walletId);

  const apply = async (tx: Transaction): Promise<CreditResult> => {
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
  };

  return transaction ? apply(transaction) : db.runTransaction(apply);
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
  return db.runTransaction(async (tx) => {
    const out = await credit(
      {
        walletId: input.walletId,
        type: 'adjustment',
        amount: -Math.abs(input.amount),
        balance: 'pending',
        description: input.description,
        orderId: input.orderId ?? null,
        suffix: 'clear_out',
      },
      tx,
    );

    // If the debit was already applied, the matching credit was too — the
    // pair is written in one transaction and cannot half-exist.
    if (!out.applied) return out;

    return credit(
      {
        walletId: input.walletId,
        type: 'adjustment',
        amount: Math.abs(input.amount),
        balance: 'available',
        description: input.description,
        orderId: input.orderId ?? null,
        suffix: 'clear_in',
      },
      tx,
    );
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
