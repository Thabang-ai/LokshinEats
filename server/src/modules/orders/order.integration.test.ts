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

  it('computes the delivery distance itself', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const productId = await seedProduct({ storeId, price: 100 });

    const order = await orderService.placeOrder(customer, {
      storeId,
      items: [{ productId, quantity: 1 }],
      // The seeded store is in Soweto; delivering across Gauteng.
      deliveryAddress: { ...address, city: 'Tembisa' },
      paymentMethod: 'cash',
      customerPhone: '0821234567',
    });

    // Never taken from the request — this figure decides which drivers see
    // the order, so a client could otherwise widen its own driver pool.
    expect(order.estimatedDistanceKm).toBeGreaterThan(20);
  });

  it('records a cash note declaration on a cash order', async () => {
    const storeId = await seedStore({ ownerId: VENDOR, deliveryFee: 20 });
    const productId = await seedProduct({ storeId, price: 100 });

    const order = await orderService.placeOrder(customer, {
      storeId,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: address,
      paymentMethod: 'cash',
      customerPhone: '0821234567',
      cashAmount: 200,
    });

    // A logistics hint for the driver's change, never a price.
    expect(order.cashAmount).toBe(200);
    expect(order.total).toBe(120);
  });

  it('refuses a cash declaration below the total', async () => {
    const storeId = await seedStore({ ownerId: VENDOR, deliveryFee: 20 });
    const productId = await seedProduct({ storeId, price: 100 });

    await expect(
      orderService.placeOrder(customer, {
        storeId,
        items: [{ productId, quantity: 1 }],
        deliveryAddress: address,
        paymentMethod: 'cash',
        customerPhone: '0821234567',
        cashAmount: 50,
      }),
    ).rejects.toThrow(/at least R120/i);
  });

  it('refuses a cash declaration on a card order', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const productId = await seedProduct({ storeId, price: 100 });

    await expect(
      orderService.placeOrder(customer, {
        storeId,
        items: [{ productId, quantity: 1 }],
        deliveryAddress: address,
        paymentMethod: 'yoco',
        customerPhone: '0821234567',
        cashAmount: 200,
      }),
    ).rejects.toThrow(/only applies to a cash order/i);
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

  it('lets a driver claim before the food is ready', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'preparing',
    });

    // Deliberate: a driver can start heading to the store while the food is
    // still being made, rather than only finding out once it is sitting done.
    const accepted = await orderService.acceptOrder(driver, orderId);

    expect(accepted.driverId).toBe(DRIVER);
    // Claiming early must not move the order along — the vendor owns status.
    expect(accepted.status).toBe('preparing');
  });

  it('treats claiming a ready order as collecting it', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'ready',
    });

    const accepted = await orderService.acceptOrder(driver, orderId);

    // The food is already waiting, so the claim is the collection.
    expect(accepted.status).toBe('picked_up');
  });

  it('refuses to claim an order the vendor has not accepted', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'pending',
    });

    await expect(orderService.acceptOrder(driver, orderId)).rejects.toThrow(
      /not available to claim/i,
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

describe('releasing a claim', () => {
  it('returns the order to the available pool', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'preparing',
      driverId: DRIVER,
    });

    const released = await orderService.releaseOrder(driver, orderId);
    expect(released.driverId).toBeNull();
  });

  it('refuses once the driver has the food', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'picked_up',
      driverId: DRIVER,
    });

    // Releasing here would leave an order nobody is carrying and a customer
    // still waiting. That needs an admin, not a tap.
    await expect(orderService.releaseOrder(driver, orderId)).rejects.toThrow(
      /already have the food/i,
    );
  });

  it('refuses a driver the order is not assigned to', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      status: 'preparing',
      driverId: OTHER_DRIVER,
    });

    await expect(orderService.releaseOrder(driver, orderId)).rejects.toThrow(
      /No such order/i,
    );
  });
});

describe('cash settlement between driver and vendor', () => {
  const vendorActor = actor(VENDOR, 'vendor');

  /** A delivered cash order, ready for the driver to settle. */
  async function deliveredCashOrder() {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      status: 'delivered',
      paymentMethod: 'cash',
      subtotal: 100,
      deliveryFee: 20,
    });
    return { orderId, storeId };
  }

  it('records the vendor’s take, not an amount the driver chose', async () => {
    const { orderId } = await deliveredCashOrder();

    const order = await orderService.recordCashHandover(driver, orderId);

    // The subtotal — the vendor's full pre-commission take. A driver who
    // could name this figure could under-declare what they owe.
    expect(order.cashGivenToVendor).toBe(true);
    expect(order.cashGivenAmount).toBe(100);
  });

  it('refuses before the order is delivered', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      status: 'picked_up',
      paymentMethod: 'cash',
    });

    await expect(
      orderService.recordCashHandover(driver, orderId),
    ).rejects.toThrow(/deliver the order/i);
  });

  it('refuses on a card order', async () => {
    const storeId = await seedStore({ ownerId: VENDOR });
    const orderId = await seedOrder({
      customerId: CUSTOMER,
      storeId,
      driverId: DRIVER,
      status: 'delivered',
      paymentMethod: 'yoco',
    });

    await expect(
      orderService.recordCashHandover(driver, orderId),
    ).rejects.toThrow(/not a cash order/i);
  });

  it('cannot be recorded twice', async () => {
    const { orderId } = await deliveredCashOrder();
    await orderService.recordCashHandover(driver, orderId);

    await expect(
      orderService.recordCashHandover(driver, orderId),
    ).rejects.toThrow(/already been marked/i);
  });

  it('lets the owning vendor confirm receipt', async () => {
    const { orderId } = await deliveredCashOrder();
    await orderService.recordCashHandover(driver, orderId);

    const settled = await orderService.settleCashReceipt(
      vendorActor,
      orderId,
      'confirm',
    );

    expect(settled.vendorCashConfirmed).toBe(true);
    expect(settled.vendorCashDisputed).toBe(false);
  });

  it('lets the owning vendor dispute it', async () => {
    const { orderId } = await deliveredCashOrder();
    await orderService.recordCashHandover(driver, orderId);

    const settled = await orderService.settleCashReceipt(
      vendorActor,
      orderId,
      'dispute',
    );

    expect(settled.vendorCashDisputed).toBe(true);
    expect(settled.vendorCashConfirmed).toBe(false);
  });

  it('refuses before the driver has claimed a handover', async () => {
    const { orderId } = await deliveredCashOrder();

    await expect(
      orderService.settleCashReceipt(vendorActor, orderId, 'confirm'),
    ).rejects.toThrow(/not recorded handing/i);
  });

  it('cannot be settled twice', async () => {
    const { orderId } = await deliveredCashOrder();
    await orderService.recordCashHandover(driver, orderId);
    await orderService.settleCashReceipt(vendorActor, orderId, 'confirm');

    await expect(
      orderService.settleCashReceipt(vendorActor, orderId, 'dispute'),
    ).rejects.toThrow(/already been settled/i);
  });

  it('refuses a vendor who does not own the store', async () => {
    const { orderId } = await deliveredCashOrder();
    await orderService.recordCashHandover(driver, orderId);

    await seedStore({ ownerId: 'other-vendor-uid' });

    await expect(
      orderService.settleCashReceipt(
        actor('other-vendor-uid', 'vendor'),
        orderId,
        'confirm',
      ),
    ).rejects.toThrow(/No such order/i);
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
