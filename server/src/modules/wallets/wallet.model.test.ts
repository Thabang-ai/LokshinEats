/**
 * Wallet model tests.
 *
 * Balances are read far more often than they are written, so the serialiser
 * has to be safe on partial and legacy documents without ever producing a
 * number a customer would query.
 */

import { describe, expect, it } from 'vitest';
import {
  LEDGER_ENTRY_TYPES,
  emptyWallet,
  toLedgerEntry,
  toWallet,
} from './wallet.model';

function snapshot(data: Record<string, unknown>, id = 'user-1') {
  return { id, data: () => data } as never;
}

describe('toWallet', () => {
  it('totals the two balances', () => {
    const wallet = toWallet(
      snapshot({ availableBalance: 120.5, pendingBalance: 79.5 }),
    );
    expect(wallet.totalBalance).toBe(200);
  });

  it('totals without floating-point drift', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary float; a balance must not
    // render like that to a vendor checking their takings.
    const wallet = toWallet(
      snapshot({ availableBalance: 0.1, pendingBalance: 0.2 }),
    );
    expect(wallet.totalBalance).toBe(0.3);
  });

  it('reads a wallet with no document as empty, not broken', () => {
    const wallet = toWallet(snapshot({}));
    expect(wallet.availableBalance).toBe(0);
    expect(wallet.pendingBalance).toBe(0);
    expect(wallet.totalBalance).toBe(0);
  });

  it('never emits NaN from junk balances', () => {
    const wallet = toWallet(
      snapshot({ availableBalance: 'lots', pendingBalance: null }),
    );
    expect(Number.isNaN(wallet.totalBalance)).toBe(false);
    expect(wallet.totalBalance).toBe(0);
  });

  it('defaults ownerId to the document id', () => {
    expect(toWallet(snapshot({}, 'driver-9')).ownerId).toBe('driver-9');
  });
});

describe('emptyWallet', () => {
  it('is zeroed and in rands', () => {
    const wallet = emptyWallet('user-2');
    expect(wallet).toMatchObject({
      id: 'user-2',
      ownerId: 'user-2',
      availableBalance: 0,
      pendingBalance: 0,
      totalBalance: 0,
      currency: 'ZAR',
    });
  });
});

describe('toLedgerEntry', () => {
  it('preserves the sign of a debit', () => {
    // Reversals and withdrawals are negative entries; losing the sign would
    // turn a clawback into a second payout.
    const entry = toLedgerEntry(
      snapshot({ type: 'refund', amount: -45.5, balance: 'pending' }),
    );
    expect(entry.amount).toBe(-45.5);
    expect(entry.balance).toBe('pending');
  });

  it('falls back to adjustment for an unrecognised type', () => {
    const entry = toLedgerEntry(snapshot({ type: 'mystery' }));
    expect(LEDGER_ENTRY_TYPES).toContain(entry.type);
    expect(entry.type).toBe('adjustment');
  });

  it('defaults an unknown balance bucket to available', () => {
    expect(toLedgerEntry(snapshot({ balance: 'elsewhere' })).balance).toBe(
      'available',
    );
  });
});
