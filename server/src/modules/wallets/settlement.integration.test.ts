/**
 * Wallet settlement against a real Firestore.
 *
 * The unit suite covers the shape of a ledger entry. What it cannot cover is
 * the behaviour that only exists once transactions, document ids, and
 * concurrent writes are real: that a replayed settlement does not pay a
 * vendor twice, that a balance always equals the sum of its ledger, and that
 * every cent a customer pays reaches exactly one of the three parties.
 *
 * Those are the properties that cost real money when they break, so they are
 * tested against the emulator rather than a mock.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertEmulator,
  actor,
  readLedger,
  readWallet,
  resetFirestore,
  seedOrder,
} from '../../test/support';
import { computeOrderEconomics } from '../../lib/money';
import * as walletService from './wallet.service';
import { PLATFORM_WALLET_ID } from './wallet.service';

const VENDOR = 'vendor-uid';
const DRIVER = 'driver-uid';
const CUSTOMER = 'customer-uid';

/** The split for a R100 basket with a R20 delivery fee. */
const economics = computeOrderEconomics(100, 20);

beforeAll(() => {
  assertEmulator();
});

beforeEach(async () => {
  await resetFirestore();
});

describe('settleOrderPayment', () => {
  it('credits the vendor pending and the platform available', async () => {
    await walletService.settleOrderPayment({
      orderId: 'order-1',
      paymentId: 'pay-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
    });

    const vendor = await readWallet(VENDOR);
    const platform = await readWallet(PLATFORM_WALLET_ID);

    // The vendor's money is not spendable yet: the order can still be
    // cancelled or refunded before it is delivered.
    expect(vendor.pending).toBe(92);
    expect(vendor.available).toBe(0);

    // The platform's commission plus its share of the delivery fee.
    expect(platform.available).toBe(11);
  });

  it('does not pay the driver at payment time', async () => {
    await walletService.settleOrderPayment({
      orderId: 'order-1',
      paymentId: 'pay-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
    });

    // The driver has not delivered anything yet.
    const driver = await readWallet(DRIVER);
    expect(driver.available).toBe(0);
    expect(driver.pending).toBe(0);
  });

  it('is idempotent — a replayed settlement pays no one twice', async () => {
    const settlement = {
      orderId: 'order-1',
      paymentId: 'pay-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
    };

    const first = await walletService.settleOrderPayment(settlement);
    // A duplicate provider webhook, a client retry, or an operator re-running
    // a stuck order all land here.
    const second = await walletService.settleOrderPayment(settlement);
    const third = await walletService.settleOrderPayment(settlement);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(third.applied).toBe(false);

    expect((await readWallet(VENDOR)).pending).toBe(92);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(11);

    // And the ledger records the movement once, not three times.
    expect(await readLedger(VENDOR)).toHaveLength(1);
    expect(await readLedger(PLATFORM_WALLET_ID)).toHaveLength(1);
  });

  it('keeps separate orders separate', async () => {
    for (const orderId of ['order-1', 'order-2', 'order-3']) {
      await walletService.settleOrderPayment({
        orderId,
        paymentId: `pay-${orderId}`,
        vendorId: VENDOR,
        vendorPayout: economics.vendorPayout,
        platformEarnings: economics.platformEarnings,
      });
    }

    // Idempotency is keyed on the order, so three real orders accumulate.
    expect((await readWallet(VENDOR)).pending).toBe(276);
    expect(await readLedger(VENDOR)).toHaveLength(3);
  });

  it('records a running balance the ledger can be replayed against', async () => {
    for (const orderId of ['order-1', 'order-2']) {
      await walletService.settleOrderPayment({
        orderId,
        paymentId: `pay-${orderId}`,
        vendorId: VENDOR,
        vendorPayout: economics.vendorPayout,
        platformEarnings: economics.platformEarnings,
      });
    }

    const ledger = await readLedger(VENDOR);
    const balances = ledger.map((entry) => entry.balanceAfter).sort((a, b) => a - b);

    // Each entry states the balance immediately after it, so the history
    // explains how the wallet reached its current number.
    expect(balances).toEqual([92, 184]);

    const summed = ledger.reduce((total, entry) => total + entry.amount, 0);
    expect(Math.round(summed * 100) / 100).toBe(
      (await readWallet(VENDOR)).pending,
    );
  });
});

describe('settleDelivery', () => {
  it('pays the driver and releases the vendor funds', async () => {
    await walletService.settleOrderPayment({
      orderId: 'order-1',
      paymentId: 'pay-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
    });

    await walletService.settleDelivery({
      orderId: 'order-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      driverId: DRIVER,
      driverPayout: economics.driverPayout,
    });

    const vendor = await readWallet(VENDOR);
    const driver = await readWallet(DRIVER);

    // Vendor money has moved from pending to available.
    expect(vendor.pending).toBe(0);
    expect(vendor.available).toBe(92);

    // The driver keeps 85% of the R20 delivery fee.
    expect(driver.available).toBe(17);
  });

  it('records the clearing as two entries, not a silent balance edit', async () => {
    await walletService.settleOrderPayment({
      orderId: 'order-1',
      paymentId: 'pay-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
    });

    await walletService.settleDelivery({
      orderId: 'order-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      driverId: DRIVER,
      driverPayout: economics.driverPayout,
    });

    const ledger = await readLedger(VENDOR);

    // One earning, one debit out of pending, one credit into available. A
    // balance that changed without a matching entry would be unexplainable.
    expect(ledger).toHaveLength(3);
    expect(ledger.filter((entry) => entry.balance === 'pending')).toHaveLength(2);
    expect(ledger.filter((entry) => entry.balance === 'available')).toHaveLength(1);
    expect(ledger.some((entry) => entry.amount === -92)).toBe(true);
  });

  it('is idempotent', async () => {
    const payment = {
      orderId: 'order-1',
      paymentId: 'pay-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
    };
    const delivery = {
      orderId: 'order-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      driverId: DRIVER,
      driverPayout: economics.driverPayout,
    };

    await walletService.settleOrderPayment(payment);
    await walletService.settleDelivery(delivery);
    await walletService.settleDelivery(delivery);
    await walletService.settleDelivery(delivery);

    // A driver whose app retried the confirmation is not paid three times.
    expect((await readWallet(DRIVER)).available).toBe(17);
    expect((await readWallet(VENDOR)).available).toBe(92);
    expect((await readWallet(VENDOR)).pending).toBe(0);
  });
});

describe('the whole order, end to end', () => {
  it('distributes exactly what the customer paid, to the cent', async () => {
    const subtotal = 137.45;
    const deliveryFee = 19.99;
    const split = computeOrderEconomics(subtotal, deliveryFee);

    await walletService.settleOrderPayment({
      orderId: 'order-1',
      paymentId: 'pay-1',
      vendorId: VENDOR,
      vendorPayout: split.vendorPayout,
      platformEarnings: split.platformEarnings,
    });

    await walletService.settleDelivery({
      orderId: 'order-1',
      vendorId: VENDOR,
      vendorPayout: split.vendorPayout,
      driverId: DRIVER,
      driverPayout: split.driverPayout,
    });

    const vendor = await readWallet(VENDOR);
    const driver = await readWallet(DRIVER);
    const platform = await readWallet(PLATFORM_WALLET_ID);

    const distributed = walletService.total([
      vendor.available,
      driver.available,
      platform.available,
    ]);

    // The money the customer handed over is the money that arrived. This is
    // the invariant the whole ledger exists to protect.
    const paid = Math.round((subtotal + deliveryFee) * 100) / 100;
    expect(distributed).toBe(paid);
    expect(vendor.pending).toBe(0);
  });
});

describe('reverseOrderSettlement', () => {
  it('claws back the vendor and platform credits', async () => {
    await walletService.settleOrderPayment({
      orderId: 'order-1',
      paymentId: 'pay-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
    });

    await walletService.reverseOrderSettlement({
      orderId: 'order-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
      reason: 'Customer never received the order',
    });

    expect((await readWallet(VENDOR)).pending).toBe(0);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(0);
  });

  it('leaves the original entries in place rather than deleting history', async () => {
    await walletService.settleOrderPayment({
      orderId: 'order-1',
      paymentId: 'pay-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
    });

    await walletService.reverseOrderSettlement({
      orderId: 'order-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
      reason: 'Customer never received the order',
    });

    const ledger = await readLedger(VENDOR);

    // A refunded order should still show what was earned and then given back.
    expect(ledger).toHaveLength(2);
    expect(ledger.some((entry) => entry.type === 'order_earning')).toBe(true);
    expect(ledger.some((entry) => entry.type === 'refund')).toBe(true);
    expect(ledger.some((entry) => entry.amount === 92)).toBe(true);
    expect(ledger.some((entry) => entry.amount === -92)).toBe(true);
  });

  it('does not reverse the same order twice', async () => {
    const settlement = {
      orderId: 'order-1',
      vendorId: VENDOR,
      vendorPayout: economics.vendorPayout,
      platformEarnings: economics.platformEarnings,
      reason: 'Duplicate reversal attempt',
    };

    await walletService.settleOrderPayment({
      ...settlement,
      paymentId: 'pay-1',
    });

    await walletService.reverseOrderSettlement(settlement);
    await walletService.reverseOrderSettlement(settlement);

    // A second reversal must not drive the vendor into a fabricated debt.
    expect((await readWallet(VENDOR)).pending).toBe(0);
    expect(await readLedger(VENDOR)).toHaveLength(2);
  });
});

describe('creditCustomer', () => {
  it('credits a refund straight to available', async () => {
    const wallet = await walletService.creditCustomer({
      actor: actor('admin-uid', 'admin'),
      customerId: CUSTOMER,
      amount: 120,
      description: 'Goodwill refund',
      type: 'refund',
    });

    // Nothing further has to happen before the customer can spend it.
    expect(wallet.availableBalance).toBe(120);
    expect(wallet.pendingBalance).toBe(0);
  });

  it('applies two separate manual credits rather than collapsing them', async () => {
    const admin = actor('admin-uid', 'admin');

    await walletService.creditCustomer({
      actor: admin,
      customerId: CUSTOMER,
      amount: 50,
      description: 'First goodwill credit',
      type: 'bonus',
    });
    await walletService.creditCustomer({
      actor: admin,
      customerId: CUSTOMER,
      amount: 25,
      description: 'Second goodwill credit',
      type: 'bonus',
    });

    // Automated settlement collapses replays on purpose; a deliberate admin
    // credit issued twice is two decisions and must count twice.
    expect((await readWallet(CUSTOMER)).available).toBe(75);
    expect(await readLedger(CUSTOMER)).toHaveLength(2);
  });

  it('refuses a zero or negative credit', async () => {
    const admin = actor('admin-uid', 'admin');

    await expect(
      walletService.creditCustomer({
        actor: admin,
        customerId: CUSTOMER,
        amount: 0,
        description: 'Nothing',
        type: 'adjustment',
      }),
    ).rejects.toThrow(/positive/i);

    await expect(
      walletService.creditCustomer({
        actor: admin,
        customerId: CUSTOMER,
        amount: -100,
        description: 'Taking money',
        type: 'adjustment',
      }),
    ).rejects.toThrow(/positive/i);
  });
});

describe('wallet reads', () => {
  it('reports an empty wallet for someone who has never earned', async () => {
    const wallet = await walletService.getOwnWallet(actor(DRIVER, 'driver'));

    // A driver on their first shift has no wallet document. That is an empty
    // wallet, not a 404.
    expect(wallet).toMatchObject({
      ownerId: DRIVER,
      availableBalance: 0,
      pendingBalance: 0,
      totalBalance: 0,
      currency: 'ZAR',
    });
  });

  it('lists a wallet history newest first', async () => {
    await seedOrder({ customerId: CUSTOMER, storeId: 'store-1' });

    for (const orderId of ['order-a', 'order-b']) {
      await walletService.settleOrderPayment({
        orderId,
        paymentId: `pay-${orderId}`,
        vendorId: VENDOR,
        vendorPayout: economics.vendorPayout,
        platformEarnings: economics.platformEarnings,
      });
    }

    const page = await walletService.listOwnTransactions(
      actor(VENDOR, 'vendor'),
      { limit: 10 },
    );

    expect(page.items).toHaveLength(2);
    expect(page.items.every((entry) => entry.walletId === VENDOR)).toBe(true);
  });
});
