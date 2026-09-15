/**
 * Cancellation tiers against a real Firestore and real wallets.
 *
 * Every cancellation goes through `orderService.changeStatus` — the path the
 * status route uses — and every paid order is actually paid for through the
 * sandbox provider, so the wallets start from a real settlement rather than a
 * seeded balance.
 *
 * One order throughout: R100 of food and a R20 delivery fee. The vendor's
 * share is R92, the driver's R17, the platform's R11, and the base arrival
 * fee for a dispatched driver is half the driver's pay: R8.50.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Collections, db } from '../../config/firebase';
import {
  actor,
  assertEmulator,
  readLedger,
  readOrder,
  readWallet,
  resetFirestore,
  seedOrder,
  seedStore,
} from '../../test/support';
import { registerPaymentProviders } from '../payments/payment.bootstrap';
import { getProvider, resetProviders } from '../payments/payment.provider';
import { SandboxPaymentProvider } from '../payments/providers/sandbox.provider';
import * as paymentRepository from '../payments/payment.repository';
import * as paymentService from '../payments/payment.service';
import { PLATFORM_WALLET_ID } from '../wallets/wallet.service';
import * as orderService from './order.service';

const CUSTOMER = 'customer-uid';
const VENDOR = 'vendor-uid';
const DRIVER = 'driver-uid';

const customer = actor(CUSTOMER, 'customer');
const vendor = actor(VENDOR, 'vendor');
const admin = actor('admin-uid', 'admin');

async function completeSandboxCharge(reference: string): Promise<void> {
  const provider = getProvider('sandbox');
  if (!(provider instanceof SandboxPaymentProvider)) {
    throw new Error('Expected the sandbox provider to be registered.');
  }
  await provider.complete(reference, 'succeed');
}

/** An order at the given stage, optionally paid for by card. */
async function order(input: {
  status?: string;
  driverId?: string | null;
  paymentMethod?: 'cash' | 'yoco';
  paid?: boolean;
}): Promise<{ orderId: string; paymentId: string | null }> {
  const storeId = await seedStore({ ownerId: VENDOR });
  const orderId = await seedOrder({
    customerId: CUSTOMER,
    storeId,
    subtotal: 100,
    deliveryFee: 20,
    status: input.status ?? 'pending',
    driverId: input.driverId ?? null,
    paymentMethod: input.paymentMethod ?? 'yoco',
  });

  if (!input.paid) return { orderId, paymentId: null };

  const { payment } = await paymentService.initiatePayment(customer, { orderId });
  await completeSandboxCharge(payment.providerReference!);
  await paymentService.verifyPayment(customer, payment.id);
  return { orderId, paymentId: payment.id };
}

async function balances() {
  const [customerWallet, vendorWallet, driverWallet, platformWallet] = await Promise.all([
    readWallet(CUSTOMER),
    readWallet(VENDOR),
    readWallet(DRIVER),
    readWallet(PLATFORM_WALLET_ID),
  ]);
  return {
    customer: customerWallet.available,
    vendorPending: vendorWallet.pending,
    vendorAvailable: vendorWallet.available,
    driver: driverWallet.available,
    platform: platformWallet.available,
  };
}

beforeAll(() => {
  assertEmulator();
  resetProviders();
  registerPaymentProviders();
});

beforeEach(async () => {
  await resetFirestore();
});

describe('tier 1: pending or accepted, before prep', () => {
  it('refunds a paid order in full and pays the vendor and driver nothing', async () => {
    const { orderId, paymentId } = await order({ status: 'pending', paid: true });
    expect((await balances()).vendorPending).toBe(92);

    const cancelled = await orderService.changeStatus(customer, orderId, 'cancelled');

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.paymentStatus).toBe('refunded');
    expect(cancelled.refundedAmount).toBe(120);
    expect(cancelled.cancellation).toMatchObject({ stage: 'before_prep', initiator: 'customer' });
    expect(await balances()).toEqual({
      customer: 120,
      vendorPending: 0,
      vendorAvailable: 0,
      driver: 0,
      platform: 0,
    });
    expect((await paymentRepository.findById(paymentId!))?.status).toBe('refunded');
  });

  it('pays a driver who had claimed an accepted order nothing', async () => {
    const { orderId } = await order({ status: 'confirmed', driverId: DRIVER, paid: true });

    await orderService.changeStatus(customer, orderId, 'cancelled');

    expect((await balances()).driver).toBe(0);
    expect((await balances()).customer).toBe(120);
  });

  it('cancels an unpaid cash order without touching any wallet', async () => {
    const { orderId } = await order({ status: 'pending', paymentMethod: 'cash' });

    await orderService.changeStatus(customer, orderId, 'cancelled');

    expect((await readOrder(orderId))?.status).toBe('cancelled');
    for (const wallet of [CUSTOMER, VENDOR, DRIVER, PLATFORM_WALLET_ID]) {
      expect(await readLedger(wallet)).toHaveLength(0);
    }
  });
});

describe('tier 2: in preparation or ready for pickup', () => {
  it('pays the vendor for the food and refunds the customer the rest', async () => {
    const { orderId, paymentId } = await order({ status: 'preparing', paid: true });

    const cancelled = await orderService.changeStatus(customer, orderId, 'cancelled');

    expect(cancelled.paymentStatus).toBe('partially_refunded');
    expect(cancelled.refundedAmount).toBe(28);
    expect(cancelled.cancellation).toMatchObject({
      stage: 'in_kitchen',
      customerRefund: 28,
      vendorPay: 92,
      driverPay: 0,
    });
    expect(await balances()).toEqual({
      customer: 28,
      // Released straight to available: no delivery is coming to do it.
      vendorPending: 0,
      vendorAvailable: 92,
      driver: 0,
      platform: 0,
    });
    const payment = await paymentRepository.findById(paymentId!);
    expect(payment?.status).toBe('partially_refunded');
    expect(payment?.refundedAmount).toBe(28);
  });

  it('pays a dispatched driver the base arrival fee out of the refund', async () => {
    const { orderId } = await order({ status: 'ready', driverId: DRIVER, paid: true });

    await orderService.changeStatus(customer, orderId, 'cancelled');

    expect(await balances()).toEqual({
      customer: 19.5,
      vendorPending: 0,
      vendorAvailable: 92,
      driver: 8.5,
      platform: 0,
    });
  });

  it('will not let a customer cancel an unpaid cash order once food is being made', async () => {
    const { orderId } = await order({ status: 'preparing', paymentMethod: 'cash' });

    await expect(orderService.changeStatus(customer, orderId, 'cancelled')).rejects.toThrow(
      /support/i,
    );

    expect((await readOrder(orderId))?.status).toBe('preparing');
    expect(await readLedger(VENDOR)).toHaveLength(0);
  });
});

describe('tier 3: picked up or on the way', () => {
  it('refunds nothing and pays the vendor and driver in full', async () => {
    const { orderId, paymentId } = await order({ status: 'picked_up', driverId: DRIVER, paid: true });

    const cancelled = await orderService.changeStatus(customer, orderId, 'cancelled');

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.paymentStatus).toBe('paid');
    expect(cancelled.refundedAmount).toBe(0);
    expect(await balances()).toEqual({
      customer: 0,
      vendorPending: 0,
      vendorAvailable: 92,
      driver: 17,
      platform: 11,
    });
    expect((await readLedger(CUSTOMER)).filter((entry) => entry.type === 'refund')).toHaveLength(0);
    expect((await paymentRepository.findById(paymentId!))?.status).toBe('succeeded');
  });
});

describe('vendor cancellations', () => {
  it('refund the customer in full, pay the vendor nothing, and cover a dispatched driver', async () => {
    const { orderId } = await order({ status: 'ready', driverId: DRIVER, paid: true });

    await orderService.changeStatus(vendor, orderId, 'cancelled');

    expect(await balances()).toEqual({
      customer: 120,
      vendorPending: 0,
      vendorAvailable: 0,
      driver: 8.5,
      // The arrival fee is a platform-covered expense, recorded as goodwill.
      platform: -8.5,
    });
    const goodwill = (await readLedger(PLATFORM_WALLET_ID)).filter((entry) => entry.type === 'goodwill');
    expect(goodwill.map((entry) => entry.amount)).toEqual([-8.5]);
  });

  it('cannot cancel once the food has left the kitchen', async () => {
    const { orderId } = await order({ status: 'picked_up', driverId: DRIVER, paid: true });

    await expect(orderService.changeStatus(vendor, orderId, 'cancelled')).rejects.toThrow();
    expect((await readOrder(orderId))?.status).toBe('picked_up');
  });
});

describe('admin cancellations', () => {
  it('pay the vendor and driver for an unpaid cash order as a goodwill expense', async () => {
    const { orderId } = await order({
      status: 'preparing',
      driverId: DRIVER,
      paymentMethod: 'cash',
    });

    await orderService.changeStatus(admin, orderId, 'cancelled');

    expect(await balances()).toEqual({
      customer: 0,
      vendorPending: 0,
      vendorAvailable: 92,
      driver: 8.5,
      platform: -100.5,
    });
  });
});

describe('robustness', () => {
  it('finishes an interrupted cancellation without paying anyone twice', async () => {
    const { orderId } = await order({ status: 'preparing', driverId: DRIVER, paid: true });

    await orderService.changeStatus(customer, orderId, 'cancelled');

    // Reproduce a cancellation that stopped before it was marked settled.
    await db.collection(Collections.orders).doc(orderId).update({ 'cancellation.settled': false });

    await orderService.changeStatus(customer, orderId, 'cancelled');

    expect(await balances()).toEqual({
      customer: 19.5,
      vendorPending: 0,
      vendorAvailable: 92,
      driver: 8.5,
      platform: 0,
    });
    expect((await readLedger(CUSTOMER)).filter((entry) => entry.type === 'refund')).toHaveLength(1);
    expect((await readOrder(orderId))?.cancellation).toMatchObject({ settled: true });
  });

  it('refuses to cancel an order twice', async () => {
    const { orderId } = await order({ status: 'pending', paid: true });

    await orderService.changeStatus(customer, orderId, 'cancelled');

    await expect(orderService.changeStatus(customer, orderId, 'cancelled')).rejects.toThrow(
      /already cancelled/i,
    );
    expect((await balances()).customer).toBe(120);
  });

  it('refunds a payment completed after the order was cancelled, instead of settling it', async () => {
    const { orderId } = await order({ status: 'pending' });
    const { payment } = await paymentService.initiatePayment(customer, { orderId });

    // The customer cancels while the card payment is still open, then finishes it.
    await orderService.changeStatus(customer, orderId, 'cancelled');
    await completeSandboxCharge(payment.providerReference!);
    const verified = await paymentService.verifyPayment(customer, payment.id);

    expect(verified.status).toBe('refunded');
    expect(await balances()).toEqual({
      customer: 120,
      vendorPending: 0,
      vendorAvailable: 0,
      driver: 0,
      platform: 0,
    });
    expect((await readOrder(orderId))?.paymentStatus).toBe('refunded');
  });
});
