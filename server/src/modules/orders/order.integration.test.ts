/**
 * Order pricing, delivery verification, and driver assignment against a real
 * Firestore.
 *
 * Two things here can only be tested with a real database. The first is that
 * pricing reads product records rather than anything the caller sent. The
 * second is contention: two drivers accepting the same order at the same
 * instant, and repeated wrong delivery codes racing the attempt counter.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  actor,
  assertEmulator,
  readOrder,
  readWallet,
  resetFirestore,
  seedOrder,
  seedProduct,
  seedStore,
  seedUser,
} from '../../test/support';
import { MAX_OTP_ATTEMPTS } from '../../lib/otp';
import { registerPaymentProviders } from '../payments/payment.bootstrap';
import { resetProviders } from '../payments/payment.provider';
import * as paymentService from '../payments/payment.service';
import * as orderService from './order.service';

const CUSTOMER = 'customer-uid';
const VENDOR = 'vendor-uid';
const DRIVER = 'driver-uid';
const OTHER_DRIVER = 'driver-two-uid';

const customer = actor(CUSTOMER, 'customer');
const driver = actor(DRIVER, 'driver');

const address = {
  street: '12 Vilakazi Street',
  city: 'Soweto',
  postalCode: '1804',
};

beforeAll(() => {
  assertEmulator();
  resetProviders();
  registerPaymentProviders();
});

beforeEach(async () => {
  await resetFirestore();
  await seedUser({ uid: CUSTOMER, role: 'customer', displayName: 'Thabo' });
});

describe('placeOrder pricing', () => {
  it('prices the order from the product records, not the request', async () => {
    const storeId = await seedStore({ ownerId: VENDOR, deliveryFee: 20 });
    const productId = await seedProduct({ storeId, price: 45.5 });

    const order = await orderService.placeOrder(customer, {
      storeId,
      items: [{ productId, quantity: 2 }],
      deliveryAddress: address,
      paymentMethod: 'yoco',
      customerPhone: '0821234567',
    });

    // 2 x 45.50 food, plus the store's own delivery fee.
    expect(order.subtotal).toBe(91);
    expect(order.deliveryFee).toBe(20);
    expect(order.total).toBe(111);

    // Line items snapshot the price so the order still reads correctly after
    // the vendor re-prices the item.
    expect(order.items[0]).toMatchObject({
      productId,
      price: 45.5,
      quantity: 2,
      lineTotal: 91,
    });
  });

  it('freezes an economics split that balances to the cent', async () => {
    const storeId = await seedStore({ ownerId: VENDOR, deliveryFee: 20 });
    const productId = await seedProduct({ storeId, price: 100 });

    const order = await orderService.placeOrder(customer, {
      storeId,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: address,
      paymentMethod: 'yoco',
      customerPhone: '0821234567',
    });

    expect(order.vendorPayout).toBe(92);
    expect(order.driverPayout).toBe(17);
    expect(order.platformEarnings).toBe(11);

    const distributed =
      order.vendorPayout + order.driverPayout + order.platformEarnings;
    expect(Math.round(distributed * 100) / 100).toBe(order.total);
  });

  it('always creates the order unpaid, whatever the payment method', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const productId = await seedProduct({ storeId, price: 100 });

    const order = await orderService.placeOrder(customer, {
      storeId,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: address,
      // The old checkout wrote 'paid' for card orders off a simulated gateway.
      paymentMethod: 'yoco',
      customerPhone: '0821234567',
    });

    expect(order.paymentStatus).toBe('pending');
    expect(order.status).toBe('pending');
    expect(order.driverId).toBeNull();
  });

  it('gives the customer a delivery code', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const productId = await seedProduct({ storeId, price: 100 });

    const order = await orderService.placeOrder(customer, {
      storeId,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: address,
      paymentMethod: 'cash',
      customerPhone: '0821234567',
    });

    // Six digits, and present because this response is for the customer.
    expect(order.deliveryCode).toMatch(/^\d{6}$/);
  });

  it('refuses a product belonging to a different store', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const otherStoreId = await seedStore({ ownerId: 'other-vendor' });
    const foreignProduct = await seedProduct({
      storeId: otherStoreId,
      price: 5,
      name: 'Cheap Chips',
    });

    // Otherwise a customer could mix cheap items from one menu into an order
    // billed to a different vendor.
    await expect(
      orderService.placeOrder(customer, {
        storeId,
        items: [{ productId: foreignProduct, quantity: 1 }],
        deliveryAddress: address,
        paymentMethod: 'cash',
        customerPhone: '0821234567',
      }),
    ).rejects.toThrow(/is not sold by/i);
  });

  it('refuses an unknown product rather than pricing it at zero', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });

    await expect(
      orderService.placeOrder(customer, {
        storeId,
        items: [{ productId: 'does-not-exist', quantity: 1 }],
        deliveryAddress: address,
        paymentMethod: 'cash',
        customerPhone: '0821234567',
      }),
    ).rejects.toThrow(/no longer on the menu/i);
  });

  it('refuses a sold-out item', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const productId = await seedProduct({
      storeId,
      price: 100,
      available: false,
    });

    await expect(
      orderService.placeOrder(customer, {
        storeId,
        items: [{ productId, quantity: 1 }],
        deliveryAddress: address,
        paymentMethod: 'cash',
        customerPhone: '0821234567',
      }),
    ).rejects.toThrow(/sold out/i);
  });

  it('refuses a closed store', async () => {
    const storeId = await seedStore({ ownerId: VENDOR, isOpen: false });
    const productId = await seedProduct({ storeId, price: 100 });

    await expect(
      orderService.placeOrder(customer, {
        storeId,
        items: [{ productId, quantity: 1 }],
        deliveryAddress: address,
        paymentMethod: 'cash',
        customerPhone: '0821234567',
      }),
    ).rejects.toThrow(/not accepting orders/i);
  });

  it('enforces the store minimum', async () => {
    const storeId = await seedStore({ ownerId: VENDOR, minOrderAmount: 50 });
    const productId = await seedProduct({ storeId, price: 20 });

    await expect(
      orderService.placeOrder(customer, {
        storeId,
        items: [{ productId, quantity: 1 }],
        deliveryAddress: address,
        paymentMethod: 'cash',
        customerPhone: '0821234567',
      }),
    ).rejects.toThrow(/minimum order/i);
  });

  it('refuses the same product on two lines', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const productId = await seedProduct({ storeId, price: 50 });

    // Silently merging them would hide a client bug while still charging for
    // both lines.
    await expect(
      orderService.placeOrder(customer, {
        storeId,
        items: [
          { productId, quantity: 1 },
          { productId, quantity: 1 },
        ],
        deliveryAddress: address,
        paymentMethod: 'cash',
        customerPhone: '0821234567',
      }),
    ).rejects.toThrow(/more than once/i);
  });
});

describe('accepting an order', () => {
  it('assigns the order to the driver who claimed it', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'ready',
    });

    const accepted = await orderService.acceptOrder(driver, orderId);
    expect(accepted.driverId).toBe(DRIVER);
  });

  it('gives the order to exactly one of two simultaneous drivers', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'ready',
    });

    // Both read driverId === null before either writes. Only one transaction
    // may commit; the other must be told the order is taken.
    const results = await Promise.allSettled([
      orderService.acceptOrder(driver, orderId),
      orderService.acceptOrder(actor(OTHER_DRIVER, 'driver'), orderId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // And the database agrees with whoever won.
    const stored = await readOrder(orderId);
    expect([DRIVER, OTHER_DRIVER]).toContain(stored?.driverId);
  });

  it('refuses an order the kitchen has not finished', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'preparing',
    });

    // A driver who claimed it early would wait at the store, and the vendor
    // could still cancel it out from under them.
    await expect(orderService.acceptOrder(driver, orderId)).rejects.toThrow(
      /not ready/i,
    );
  });

  it('refuses an order another driver already took', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'ready',
      driverId: OTHER_DRIVER,
    });

    await expect(orderService.acceptOrder(driver, orderId)).rejects.toThrow(
      /already taken|another driver/i,
    );
  });
});

describe('confirming delivery', () => {
  /** An order that has been paid for and collected. */
  async function paidAndCollected(code = '482913') {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      status: 'picked_up',
      deliveryCode: code,
      subtotal: 100,
      deliveryFee: 20,
    });

    await paymentService.settleCashOrder(orderId).catch(() => undefined);
    return { orderId, storeId };
  }

  it('marks the order delivered and pays the driver', async () => {
    const { orderId } = await paidAndCollected('482913');

    const result = await orderService.confirmDelivery(driver, orderId, '482913');

    expect(result.outcome).toBe('delivered');

    const stored = await readOrder(orderId);
    expect(stored?.status).toBe('delivered');
    expect(stored?.deliveryVerified).toBe(true);
    // Legacy field kept in step so existing web views still read it.
    expect(stored?.deliveryOTPVerified).toBe(true);

    // Money moves only now, because this is when the handover happened.
    expect((await readWallet(DRIVER)).available).toBe(17);
  });

  it('rejects a wrong code and burns an attempt', async () => {
    const { orderId } = await paidAndCollected('482913');

    const result = await orderService.confirmDelivery(driver, orderId, '000000');

    expect(result.outcome).toBe('wrong_code');
    if (result.outcome === 'wrong_code') {
      expect(result.attemptsRemaining).toBe(MAX_OTP_ATTEMPTS - 1);
    }

    // Nothing was delivered and nobody was paid.
    expect((await readOrder(orderId))?.status).toBe('picked_up');
    expect((await readWallet(DRIVER)).available).toBe(0);
  });

  it('locks the order after too many wrong codes', async () => {
    const { orderId } = await paidAndCollected('482913');

    for (let attempt = 0; attempt < MAX_OTP_ATTEMPTS; attempt += 1) {
      const result = await orderService.confirmDelivery(
        driver,
        orderId,
        '000000',
      );
      expect(result.outcome).toBe('wrong_code');
    }

    // Even the correct code no longer works — a driver cannot guess their way
    // to a confirmed delivery.
    await expect(
      orderService.confirmDelivery(driver, orderId, '482913'),
    ).rejects.toThrow(/too many incorrect codes/i);

    expect((await readOrder(orderId))?.status).toBe('picked_up');
    expect((await readWallet(DRIVER)).available).toBe(0);
  });

  it('counts concurrent guesses rather than letting them race', async () => {
    const { orderId } = await paidAndCollected('482913');

    // Fired together, these all read the same attempt count. If the counter
    // were not inside the transaction, they would each write "1".
    await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        orderService.confirmDelivery(driver, orderId, '111111'),
      ),
    );

    const attempts = Number((await readOrder(orderId))?.deliveryCodeAttempts ?? 0);
    expect(attempts).toBe(4);
  });

  it('refuses a driver the order is not assigned to', async () => {
    const { orderId } = await paidAndCollected('482913');

    // Reported as missing so a driver cannot probe other orders.
    await expect(
      orderService.confirmDelivery(
        actor(OTHER_DRIVER, 'driver'),
        orderId,
        '482913',
      ),
    ).rejects.toThrow(/No such order/i);

    expect((await readOrder(orderId))?.status).toBe('picked_up');
  });

  it('refuses an order that was never collected', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      status: 'ready',
      deliveryCode: '482913',
    });

    await expect(
      orderService.confirmDelivery(driver, orderId, '482913'),
    ).rejects.toThrow(/collect the order/i);
  });

  it('refuses to deliver the same order twice', async () => {
    const { orderId } = await paidAndCollected('482913');

    await orderService.confirmDelivery(driver, orderId, '482913');

    await expect(
      orderService.confirmDelivery(driver, orderId, '482913'),
    ).rejects.toThrow(/already delivered/i);

    // And the driver was paid once, not twice.
    expect((await readWallet(DRIVER)).available).toBe(17);
  });
});

describe('order visibility', () => {
  it('hides the delivery code from the assigned driver', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      status: 'picked_up',
      deliveryCode: '482913',
    });

    const asDriver = await orderService.getOrder(driver, orderId);
    const asCustomer = await orderService.getOrder(customer, orderId);

    // The whole point: the driver submits a code they were never given.
    expect(asDriver.deliveryCode).toBeUndefined();
    expect(JSON.stringify(asDriver)).not.toContain('482913');
    expect(asCustomer.deliveryCode).toBe('482913');
  });

  it('refuses to show an order to an unrelated customer', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({ customerId: 'someone-else', storeId });

    await expect(
      orderService.getOrder(customer, orderId),
    ).rejects.toThrow(/No such order/i);
  });
});
