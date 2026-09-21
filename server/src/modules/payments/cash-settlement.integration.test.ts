/**
 * Cash orders, booked as the cash actually moves.
 *
 * The earnings are the same as a card order's. What differs is who is
 * holding the money: on a cash order it is the driver at the door, then the
 * kitchen once the driver hands its share over. Before this was modelled, a
 * cash order paid the kitchen and the driver twice - once in cash, once
 * again in their wallets - and credited the platform money it never received.
 *
 * The figures throughout come from a R100 order with a R20 delivery fee:
 * the kitchen's share is R92, the driver's R17, the platform's R11.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  actor,
  assertEmulator,
  readLedger,
  readWallet,
  resetFirestore,
  seedOrder,
  seedStore,
  seedUser,
} from '../../test/support';
import { registerPaymentProviders } from './payment.bootstrap';
import { resetProviders } from './payment.provider';
import * as orderService from '../orders/order.service';
import { PLATFORM_WALLET_ID } from '../wallets/wallet.service';

const CUSTOMER = 'customer-uid';
const VENDOR = 'vendor-uid';
const DRIVER = 'driver-uid';

const driver = actor(DRIVER, 'driver');
const vendor = actor(VENDOR, 'vendor');

const CODE = '482913';

beforeAll(() => {
  assertEmulator();
  resetProviders();
  registerPaymentProviders();
});

beforeEach(async () => {
  await resetFirestore();
  await seedUser({ uid: CUSTOMER, role: 'customer' });
});

/** A cash order the driver has collected from the kitchen. */
async function collectedCashOrder(): Promise<string> {
  const storeId = await seedStore({ ownerId: VENDOR });
  return seedOrder({
    customerId: CUSTOMER,
    storeId,
    driverId: DRIVER,
    status: 'picked_up',
    paymentMethod: 'cash',
    subtotal: 100,
    deliveryFee: 20,
    deliveryCode: CODE,
  });
}

/** Where each party stands, in rands, across both buckets. */
async function positions() {
  const [kitchen, drv, platform] = await Promise.all([
    readWallet(VENDOR),
    readWallet(DRIVER),
    readWallet(PLATFORM_WALLET_ID),
  ]);
  const total = (w: { available: number; pending: number }) =>
    Math.round((w.available + w.pending) * 100) / 100;
  return {
    kitchen: total(kitchen),
    driver: total(drv),
    platform: total(platform),
  };
}

/** Money is only ever moved between wallets, never made. */
function balanced(p: { kitchen: number; driver: number; platform: number }) {
  return Math.round((p.kitchen + p.driver + p.platform) * 100) / 100;
}

describe('a delivered cash order', () => {
  it('leaves the driver holding the cash, and owing it', async () => {
    const orderId = await collectedCashOrder();

    await orderService.confirmDelivery(driver, orderId, CODE);

    const p = await positions();
    // Earnings are exactly a card order's...
    expect(p.kitchen).toBe(92);
    expect(p.platform).toBe(11);
    // ...but the driver collected R120 of other people's money at the door:
    // R17 of it theirs, R103 owed to the kitchen and the platform.
    expect(p.driver).toBe(-103);
    expect(balanced(p)).toBe(0);

    const ledger = await readLedger(DRIVER);
    expect(ledger.map((e) => [e.type, e.amount])).toEqual(
      expect.arrayContaining([
        ['order_earning', 17],
        ['cash_collected', -120],
      ]),
    );
  });

  it('once the kitchen confirms the handover, each owes the platform its share', async () => {
    const orderId = await collectedCashOrder();
    await orderService.confirmDelivery(driver, orderId, CODE);
    await orderService.recordCashHandover(driver, orderId);

    await orderService.settleCashReceipt(vendor, orderId, 'confirm');

    const p = await positions();
    // The kitchen was paid R100 in cash against a R92 share: it owes the R8
    // commission. The driver kept R20 against R17: it owes R3.
    expect(p.kitchen).toBe(-8);
    expect(p.driver).toBe(-3);
    expect(p.platform).toBe(11);
    expect(balanced(p)).toBe(0);

    const kitchenLedger = await readLedger(VENDOR);
    const handover = kitchenLedger.find((e) => e.type === 'cash_handover');
    expect(handover?.amount).toBe(-100);
  });

  it('a disputed handover moves nothing: the driver still owes the kitchen', async () => {
    const orderId = await collectedCashOrder();
    await orderService.confirmDelivery(driver, orderId, CODE);
    await orderService.recordCashHandover(driver, orderId);

    await orderService.settleCashReceipt(vendor, orderId, 'dispute');

    const p = await positions();
    expect(p.kitchen).toBe(92);
    expect(p.driver).toBe(-103);
    expect(balanced(p)).toBe(0);
  });

  it('a second confirmation is refused and moves nothing twice', async () => {
    const orderId = await collectedCashOrder();
    await orderService.confirmDelivery(driver, orderId, CODE);
    await orderService.recordCashHandover(driver, orderId);
    await orderService.settleCashReceipt(vendor, orderId, 'confirm');

    await expect(
      orderService.settleCashReceipt(vendor, orderId, 'confirm'),
    ).rejects.toThrow(/already been settled/i);

    const p = await positions();
    expect(p.kitchen).toBe(-8);
    expect(p.driver).toBe(-3);
  });
});

describe('a delivered card order', () => {
  it('is untouched: no cash entries, the driver simply earns', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      status: 'picked_up',
      paymentMethod: 'yoco',
      subtotal: 100,
      deliveryFee: 20,
      deliveryCode: CODE,
    });

    await orderService.confirmDelivery(driver, orderId, CODE);

    expect((await readWallet(DRIVER)).available).toBe(17);
    const ledger = await readLedger(DRIVER);
    expect(ledger.some((e) => e.type.startsWith('cash_'))).toBe(false);
  });
});
