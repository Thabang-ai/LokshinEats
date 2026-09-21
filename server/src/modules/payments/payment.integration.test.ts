/**
 * Payment settlement against a real Firestore.
 *
 * The property under test is the one the old web checkout got wrong: an order
 * becomes paid because the provider said so, for the right amount, and for no
 * other reason. Everything here goes through the sandbox provider, which
 * makes a charge that stays pending until something explicitly resolves it —
 * so a test that wants a paid order has to actually pay for it.
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
import { registerPaymentProviders } from './payment.bootstrap';
import { getProvider, resetProviders } from './payment.provider';
import { PLATFORM_WALLET_ID } from '../wallets/wallet.service';
import * as walletService from '../wallets/wallet.service';
import { SandboxPaymentProvider } from './providers/sandbox.provider';
import * as paymentService from './payment.service';
import * as paymentRepository from './payment.repository';
import * as orderRepository from '../orders/order.repository';
import * as orderService from '../orders/order.service';

const CUSTOMER = 'customer-uid';
const VENDOR = 'vendor-uid';
const DRIVER = 'driver-uid';

const customer = actor(CUSTOMER, 'customer');
const admin = actor('admin-uid', 'admin');

/** Resolve a sandbox charge the way a customer finishing checkout would. */
async function completeSandboxCharge(
  reference: string,
  outcome: 'succeed' | 'fail',
): Promise<void> {
  const provider = getProvider('sandbox');
  if (!(provider instanceof SandboxPaymentProvider)) {
    throw new Error('Expected the sandbox provider to be registered.');
  }
  await provider.complete(reference, outcome);
}

beforeAll(() => {
  assertEmulator();
  resetProviders();
  registerPaymentProviders();
});

beforeEach(async () => {
  await resetFirestore();
});

describe('initiatePayment', () => {
  it('charges the order total, not an amount the caller chose', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      subtotal: 100,
      deliveryFee: 20,
    });

    const result = await paymentService.initiatePayment(customer, { orderId });

    // The amount is read from the order the server priced.
    expect(result.payment.amount).toBe(120);
    expect(result.payment.status).toBe('initiated');
    expect(result.payment.provider).toBe('sandbox');
  });

  it('refuses to charge for someone else’s order', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: 'someone-else', storeId });

    // Reported as missing rather than forbidden, so order ids cannot be
    // probed by watching which ones return 403.
    await expect(
      paymentService.initiatePayment(customer, { orderId }),
    ).rejects.toThrow(/No such order/i);
  });

  it('refuses an order that is already paid', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      paymentStatus: 'paid',
    });

    await expect(
      paymentService.initiatePayment(customer, { orderId }),
    ).rejects.toThrow(/already been paid/i);
  });

  it('refuses a cash order, which settles at the door instead', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      paymentMethod: 'cash',
    });

    await expect(
      paymentService.initiatePayment(customer, { orderId }),
    ).rejects.toThrow(/settled on delivery/i);
  });

  it('refuses a provider that is not registered', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: CUSTOMER, storeId });

    // Silently falling back to some other gateway would mean charging
    // through one nobody chose.
    await expect(
      paymentService.initiatePayment(customer, { orderId, provider: 'paystack' }),
    ).rejects.toThrow(/not available/i);
  });
});

describe('verifyPayment', () => {
  it('leaves the order unpaid while the charge is still pending', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: CUSTOMER, storeId });

    const { payment } = await paymentService.initiatePayment(customer, {
      orderId,
    });

    // Nothing has resolved the charge, so nothing may be settled.
    const verified = await paymentService.verifyPayment(customer, payment.id);

    expect(verified.status).toBe('initiated');
    expect((await readOrder(orderId))?.paymentStatus).toBe('pending');
    expect((await readWallet(VENDOR)).pending).toBe(0);
  });

  it('marks the order paid and credits wallets once the charge succeeds', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      subtotal: 100,
      deliveryFee: 20,
    });

    const { payment } = await paymentService.initiatePayment(customer, {
      orderId,
    });
    await completeSandboxCharge(payment.providerReference!, 'succeed');

    const verified = await paymentService.verifyPayment(customer, payment.id);

    expect(verified.status).toBe('succeeded');
    expect(verified.transactionId).toBeTruthy();

    const order = await readOrder(orderId);
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.paymentTransactionId).toBe(verified.transactionId);

    // Vendor share is pending until delivery; the platform takes its cut now.
    expect((await readWallet(VENDOR)).pending).toBe(92);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(11);
  });

  it('records a failed charge without paying anyone', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: CUSTOMER, storeId });

    const { payment } = await paymentService.initiatePayment(customer, {
      orderId,
    });
    await completeSandboxCharge(payment.providerReference!, 'fail');

    const verified = await paymentService.verifyPayment(customer, payment.id);

    expect(verified.status).toBe('failed');
    expect(verified.failureReason).toBeTruthy();
    expect((await readOrder(orderId))?.paymentStatus).toBe('failed');
    expect((await readWallet(VENDOR)).pending).toBe(0);
  });

  it('refuses to settle when the captured amount is not the order total', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      subtotal: 100,
      deliveryFee: 20,
    });

    const { payment } = await paymentService.initiatePayment(customer, {
      orderId,
    });

    // The charge was created for R120. Move the order's price afterwards so
    // the captured amount no longer matches what is owed — the shape of
    // either a pricing bug or an attempt to pay R1 for a R500 basket.
    await db
      .collection(Collections.orders)
      .doc(orderId)
      .update({ total: 500 });

    await completeSandboxCharge(payment.providerReference!, 'succeed');

    await expect(
      paymentService.verifyPayment(customer, payment.id),
    ).rejects.toThrow(/does not match/i);

    // Nothing settled: no money moved and the order is not marked paid.
    const order = await readOrder(orderId);
    expect(order?.paymentStatus).not.toBe('paid');
    expect((await readWallet(VENDOR)).pending).toBe(0);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(0);
  });

  it('is idempotent — polling after success settles nothing twice', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      subtotal: 100,
      deliveryFee: 20,
    });

    const { payment } = await paymentService.initiatePayment(customer, {
      orderId,
    });
    await completeSandboxCharge(payment.providerReference!, 'succeed');

    // A client returning from a redirect will poll this.
    await paymentService.verifyPayment(customer, payment.id);
    await paymentService.verifyPayment(customer, payment.id);
    await paymentService.verifyPayment(customer, payment.id);

    expect((await readWallet(VENDOR)).pending).toBe(92);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(11);
  });

  it('refuses to verify someone else’s payment', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: CUSTOMER, storeId });

    const { payment } = await paymentService.initiatePayment(customer, {
      orderId,
    });

    await expect(
      paymentService.verifyPayment(actor('intruder', 'customer'), payment.id),
    ).rejects.toThrow(/No such payment/i);
  });
});

describe('settleCashOrder', () => {
  it('credits the same wallets a card order would', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      paymentMethod: 'cash',
      subtotal: 100,
      deliveryFee: 20,
    });

    await paymentService.settleCashOrder(orderId);

    // Reporting should not have to care how an order was paid for.
    expect((await readOrder(orderId))?.paymentStatus).toBe('paid');
    expect((await readWallet(VENDOR)).pending).toBe(92);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(11);
  });

  it('does nothing for a card order', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      paymentMethod: 'yoco',
    });

    await paymentService.settleCashOrder(orderId);

    expect((await readOrder(orderId))?.paymentStatus).toBe('pending');
    expect((await readWallet(VENDOR)).pending).toBe(0);
  });
});

describe('settleDelivery', () => {
  it('pays the driver and releases the vendor funds', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      subtotal: 100,
      deliveryFee: 20,
    });

    const { payment } = await paymentService.initiatePayment(customer, {
      orderId,
    });
    await completeSandboxCharge(payment.providerReference!, 'succeed');
    await paymentService.verifyPayment(customer, payment.id);

    await paymentService.settleDelivery(orderId);

    expect((await readWallet(DRIVER)).available).toBe(17);
    expect((await readWallet(VENDOR)).available).toBe(92);
    expect((await readWallet(VENDOR)).pending).toBe(0);
  });

  it('settles a cash order at the same moment', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      paymentMethod: 'cash',
      subtotal: 100,
      deliveryFee: 20,
    });

    // Cash is only actually paid when the driver hands the food over.
    await paymentService.settleDelivery(orderId);

    expect((await readOrder(orderId))?.paymentStatus).toBe('paid');
    // The kitchen's earnings are a card order's. The driver earned R17 but is
    // holding the R120 the customer paid, so is R103 down until they hand the
    // kitchen its share (see cash-settlement.integration.test.ts).
    expect((await readWallet(VENDOR)).available).toBe(92);
    expect((await readWallet(DRIVER)).available).toBe(-103);
  });

  it('still settles a card order for a kitchen already owing from cash orders', async () => {
    // A negative balance is now an ordinary state - a kitchen that took cash
    // owes the platform its commission. Reading that balance used to be
    // refused as invalid money, which would have failed the next settlement
    // on the wallet: this card order's.
    const storeId = await seedStore({ ownerId: VENDOR });
    await db.collection(Collections.wallets).doc(VENDOR).set({
      ownerId: VENDOR,
      availableBalance: -8,
      pendingBalance: 0,
      currency: 'ZAR',
    });

    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      paymentMethod: 'yoco',
      subtotal: 100,
      deliveryFee: 20,
    });
    await walletService.settleOrderPayment({
      orderId,
      paymentId: null,
      vendorId: VENDOR,
      vendorPayout: 92,
      platformEarnings: 11,
    });

    await paymentService.settleDelivery(orderId);

    // R92 earned on the card order, less the R8 owed from before.
    expect((await readWallet(VENDOR)).available).toBe(84);
  });

  it('does nothing when no driver was assigned', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: null,
    });

    await paymentService.settleDelivery(orderId);

    expect((await readWallet(DRIVER)).available).toBe(0);
  });
});

describe('refundPayment', () => {
  it('reverses the settlement and credits the customer', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      subtotal: 100,
      deliveryFee: 20,
    });

    const { payment } = await paymentService.initiatePayment(customer, {
      orderId,
    });
    await completeSandboxCharge(payment.providerReference!, 'succeed');
    await paymentService.verifyPayment(customer, payment.id);

    const refunded = await paymentService.refundPayment(
      admin,
      payment.id,
      'Order never arrived',
    );

    expect(refunded.status).toBe('refunded');

    // Vendor and platform give the money back; the customer receives it.
    expect((await readWallet(VENDOR)).pending).toBe(0);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(0);
    expect((await readWallet(CUSTOMER)).available).toBe(120);
    expect((await readOrder(orderId))?.paymentStatus).toBe('refunded');
  });

  it('refuses to refund a payment that never succeeded', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: CUSTOMER, storeId });

    const { payment } = await paymentService.initiatePayment(customer, {
      orderId,
    });

    await expect(
      paymentService.refundPayment(admin, payment.id, 'Changed mind'),
    ).rejects.toThrow(/successful payment/i);

    expect((await readWallet(CUSTOMER)).available).toBe(0);
  });
});

describe('admin refunds under the cancellation tiers', () => {
  /** A card order, paid through the sandbox provider. */
  async function paidOrder(input: {
    status?: string;
    driverId?: string | null;
    deliveryCode?: string;
  } = {}): Promise<{ orderId: string; paymentId: string }> {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      subtotal: 100,
      deliveryFee: 20,
      status: input.status,
      driverId: input.driverId ?? null,
      deliveryCode: input.deliveryCode,
    });

    const { payment } = await paymentService.initiatePayment(customer, { orderId });
    await completeSandboxCharge(payment.providerReference!, 'succeed');
    await paymentService.verifyPayment(customer, payment.id);

    return { orderId, paymentId: payment.id };
  }

  it('refunds automatically before prep, cancelling the order and taking it off the drivers\' queue', async () => {
    const { orderId, paymentId } = await paidOrder({ status: 'confirmed' });

    const before = await orderRepository.listAvailableForDrivers({ limit: 20, audience: 'driver' });
    expect(before.items.map((order) => order.id)).toContain(orderId);

    const refunded = await paymentService.refundPayment(admin, paymentId, 'Kitchen closed early');

    expect(refunded.status).toBe('refunded');
    expect((await readOrder(orderId))?.status).toBe('cancelled');
    expect((await readWallet(CUSTOMER)).available).toBe(120);
    expect((await readWallet(VENDOR)).pending).toBe(0);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(0);

    const after = await orderRepository.listAvailableForDrivers({ limit: 20, audience: 'driver' });
    expect(after.items.map((order) => order.id)).not.toContain(orderId);
  });

  it('blocks an automatic refund once the kitchen has started', async () => {
    const { orderId, paymentId } = await paidOrder({ status: 'preparing' });

    await expect(
      paymentService.refundPayment(admin, paymentId, 'Customer changed their mind'),
    ).rejects.toThrow(/goodwill/i);

    // Nothing moved: the order is still being made and the vendor keeps their share.
    expect((await readOrder(orderId))?.status).toBe('preparing');
    expect((await readWallet(CUSTOMER)).available).toBe(0);
    expect((await readWallet(VENDOR)).pending).toBe(92);
    expect((await paymentRepository.findById(paymentId))?.status).toBe('succeeded');
  });

  it('as goodwill mid-prep, pays vendor and driver their tier and covers the rest from the platform', async () => {
    const { orderId, paymentId } = await paidOrder({ status: 'preparing', driverId: DRIVER });

    const refunded = await paymentService.refundPayment(admin, paymentId, 'Kitchen fire', {
      goodwill: true,
    });

    expect(refunded.status).toBe('refunded');
    expect((await readOrder(orderId))?.status).toBe('cancelled');
    expect((await readWallet(CUSTOMER)).available).toBe(120);
    expect((await readWallet(VENDOR)).available).toBe(92);
    expect((await readWallet(VENDOR)).pending).toBe(0);
    expect((await readWallet(DRIVER)).available).toBe(8.5);
    // R19.50 came from the order under the policy; R100.50 is the platform's.
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(-100.5);
    const goodwill = (await readLedger(PLATFORM_WALLET_ID)).filter((entry) => entry.type === 'goodwill');
    expect(goodwill.map((entry) => entry.amount)).toEqual([-100.5]);
  });

  it('blocks a refund on the way unless it is goodwill, and then keeps the driver from completing it', async () => {
    const { orderId, paymentId } = await paidOrder({
      status: 'picked_up',
      driverId: DRIVER,
      deliveryCode: '123456',
    });

    await expect(
      paymentService.refundPayment(admin, paymentId, 'Customer no longer at the address'),
    ).rejects.toThrow(/goodwill/i);
    expect((await readOrder(orderId))?.status).toBe('picked_up');

    await paymentService.refundPayment(admin, paymentId, 'Customer no longer at the address', {
      goodwill: true,
    });

    expect((await readOrder(orderId))?.status).toBe('cancelled');
    expect((await readWallet(DRIVER)).available).toBe(17);
    expect((await readWallet(VENDOR)).available).toBe(92);
    expect((await readWallet(CUSTOMER)).available).toBe(120);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(-109);
    await expect(
      orderRepository.completeDelivery(orderId, DRIVER, '123456'),
    ).rejects.toThrow(/collect the order/i);
  });

  it('refunds a delivered order only as goodwill, leaving the vendor and driver paid', async () => {
    const { orderId, paymentId } = await paidOrder({ status: 'delivered', driverId: DRIVER });
    await paymentService.settleDelivery(orderId);

    await expect(
      paymentService.refundPayment(admin, paymentId, 'Food arrived cold'),
    ).rejects.toThrow(/goodwill/i);

    await paymentService.refundPayment(admin, paymentId, 'Food arrived cold', { goodwill: true });

    expect((await readOrder(orderId))?.status).toBe('delivered');
    expect((await readWallet(VENDOR)).available).toBe(92);
    expect((await readWallet(VENDOR)).pending).toBe(0);
    expect((await readWallet(DRIVER)).available).toBe(17);
    expect((await readWallet(CUSTOMER)).available).toBe(120);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(-109);
  });

  it('tops up an order the customer cancelled mid-prep only as goodwill', async () => {
    const { orderId, paymentId } = await paidOrder({ status: 'preparing' });
    await orderService.changeStatus(customer, orderId, 'cancelled');
    expect((await readWallet(CUSTOMER)).available).toBe(28);

    await expect(
      paymentService.refundPayment(admin, paymentId, 'Customer complained'),
    ).rejects.toThrow(/goodwill/i);

    await paymentService.refundPayment(admin, paymentId, 'Customer complained', { goodwill: true });

    expect((await readWallet(CUSTOMER)).available).toBe(120);
    expect((await readWallet(VENDOR)).available).toBe(92);
  });

  it('can be retried after an interruption without paying the customer twice', async () => {
    const { orderId, paymentId } = await paidOrder({ status: 'preparing' });

    await paymentService.refundPayment(admin, paymentId, 'Kitchen fire', { goodwill: true });

    // Reproduce a goodwill refund whose last writes never landed: the money
    // has moved, but neither the order nor the payment recorded it.
    await db.collection(Collections.orders).doc(orderId).update({ refundedAmount: 28 });
    await paymentRepository.updateStatus(paymentId, 'partially_refunded', { refundedAmount: 28 });

    const retried = await paymentService.refundPayment(admin, paymentId, 'Kitchen fire', {
      goodwill: true,
    });

    expect(retried.status).toBe('refunded');
    expect((await readWallet(CUSTOMER)).available).toBe(120);
    expect((await readLedger(CUSTOMER)).filter((entry) => entry.type === 'refund')).toHaveLength(2);
    expect((await readWallet(PLATFORM_WALLET_ID)).available).toBe(-92);
  });

  it('refuses to refund a payment already refunded in full', async () => {
    const { paymentId } = await paidOrder({ status: 'pending' });
    await paymentService.refundPayment(admin, paymentId, 'Duplicate order');

    await expect(
      paymentService.refundPayment(admin, paymentId, 'Duplicate order', { goodwill: true }),
    ).rejects.toThrow(/already been refunded/i);
    expect((await readWallet(CUSTOMER)).available).toBe(120);
  });
});
