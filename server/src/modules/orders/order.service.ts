/**
 * Order business rules.
 *
 * The important function here is `priceOrder`. The web checkout computed the
 * subtotal, the delivery fee, the total, and all four payout figures in the
 * browser and wrote them onto the order document. Anyone could therefore
 * order a R500 basket, claim a R5 total, and hand themselves the platform's
 * commission. Here the client sends product ids and quantities, and every
 * number is derived from the store and product records.
 */

import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import { computeOrderEconomics, assertSplitBalances, toRands, toCents } from '../../lib/money';
import { estimateOrderDistanceKm } from '../../lib/geo';
import { createDeliveryCode } from '../../lib/otp';
import type { Page } from '../../lib/pagination';
import type { AuthContext } from '../../middleware/auth';
import * as paymentService from '../payments/payment.service';
import { cardPaymentsEnabled } from '../payments/payment.provider';
import * as productRepository from '../products/product.repository';
import * as storeRepository from '../stores/store.repository';
import * as userRepository from '../users/user.repository';
import * as walletService from '../wallets/wallet.service';
import * as notificationService from '../notifications/notification.service';
import {
  canTransition,
  type Audience,
  type CreateOrderInput,
  type ListOrdersQuery,
  type Order,
  type OrderStatus,
} from './order.model';
import * as cancellationService from './cancellation.service';
import type { CancellationStage } from './cancellation.policy';
import * as repository from './order.repository';
import type { DeliveryResult, NewOrderDocument } from './order.repository';

const log = moduleLogger('orders');

/** The audience an order should be serialised for, given who is asking. */
function audienceFor(caller: AuthContext, order: { customerId: string }): Audience {
  if (caller.role === 'admin') return 'admin';
  if (caller.uid === order.customerId) return 'customer';
  if (caller.role === 'vendor') return 'vendor';
  return 'driver';
}

/**
 * Turn a basket of product ids into priced line items.
 *
 * Every price comes from the product document. The client's only influence
 * is which products and how many of each.
 */
async function priceOrder(
  input: CreateOrderInput,
): Promise<{
  items: NewOrderDocument['items'];
  subtotal: number;
  deliveryFee: number;
  total: number;
  storeName: string;
  storeCity: string;
}> {
  const store = await storeRepository.findById(input.storeId);
  if (!store) throw ApiError.notFound('No such store.');
  if (!store.isOpen) {
    throw ApiError.conflict(`${store.name} is not accepting orders right now.`);
  }

  // Reject duplicate product ids rather than merging them: a client that
  // sends the same item twice has a bug, and silently combining the lines
  // would hide it while still charging for both.
  const productIds = input.items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw ApiError.unprocessable(
      'The same item appears more than once. Combine it into a single line with a quantity.',
    );
  }

  const products = await productRepository.findManyByIds(productIds);
  const byId = new Map(products.map((product) => [product.id, product]));

  const items: NewOrderDocument['items'] = [];
  let subtotalCents = 0;

  for (const line of input.items) {
    const product = byId.get(line.productId);

    if (!product) {
      throw ApiError.unprocessable(
        `One of the items is no longer on the menu. Refresh your cart and try again.`,
      );
    }
    // A product from another store would let a customer mix cheap items from
    // one menu into an order billed to a different vendor.
    if (product.storeId !== store.id) {
      throw ApiError.unprocessable(
        `${product.name} is not sold by ${store.name}.`,
      );
    }
    if (!product.available) {
      throw ApiError.conflict(`${product.name} is sold out.`);
    }

    const lineTotalCents =
      toCents(product.price, `price of ${product.name}`) * line.quantity;
    subtotalCents += lineTotalCents;

    items.push({
      productId: product.id,
      // Name and price are snapshotted so the order still reads correctly
      // after the vendor renames or re-prices the item.
      name: product.name,
      price: product.price,
      quantity: line.quantity,
      specialInstructions: line.specialInstructions ?? null,
      lineTotal: toRands(lineTotalCents),
    });
  }

  const subtotal = toRands(subtotalCents);

  if (subtotal < store.minOrderAmount) {
    throw ApiError.unprocessable(
      `${store.name} has a minimum order of R${store.minOrderAmount.toFixed(2)}.`,
    );
  }

  // The delivery fee comes from the store record, not from the request.
  const deliveryFee = store.deliveryFee;
  const total = toRands(subtotalCents + toCents(deliveryFee, 'deliveryFee'));

  return {
    items,
    subtotal,
    deliveryFee,
    total,
    storeName: store.name,
    storeCity: store.city,
  };
}

/**
 * Place an order.
 *
 * Returns the order serialised for the customer, which is the only audience
 * that receives the delivery code.
 */
export async function placeOrder(
  caller: AuthContext,
  input: CreateOrderInput,
): Promise<Order> {
  // Hiding card and EFT in the apps is a courtesy; this is the rule. An order
  // the API has no way to charge for must not exist, or it sits "awaiting
  // payment" forever with food possibly already cooking.
  if (input.paymentMethod !== 'cash' && !cardPaymentsEnabled()) {
    throw ApiError.unprocessable(
      'Card and EFT payments are not available yet. Choose cash on delivery.',
    );
  }

  const priced = await priceOrder(input);

  // A cash-note declaration only makes sense on a cash order, and it cannot
  // be less than the bill. Rejected rather than ignored, so a client sending
  // it on a card order finds out.
  if (input.cashAmount !== undefined) {
    if (input.paymentMethod !== 'cash') {
      throw ApiError.unprocessable(
        'A cash amount only applies to a cash order.',
      );
    }
    if (input.cashAmount < priced.total) {
      throw ApiError.unprocessable(
        `Cash amount must be at least R${priced.total.toFixed(2)}.`,
      );
    }
  }

  const economics = computeOrderEconomics(priced.subtotal, priced.deliveryFee);
  // Cheap insurance against a pricing bug quietly creating or destroying
  // money: every cent the customer pays must land in exactly one bucket.
  assertSplitBalances(priced.subtotal, priced.deliveryFee, economics);

  const profile = await userRepository.findById(caller.uid);

  const document: NewOrderDocument = {
    customerId: caller.uid,
    // Denormalised so vendors and drivers can render the order without
    // reading users/{customerId}, which they are not allowed to do.
    customerName: profile?.displayName || caller.email || 'Customer',
    customerPhone: input.customerPhone,
    storeId: input.storeId,
    storeName: priced.storeName,
    items: priced.items,
    subtotal: priced.subtotal,
    deliveryFee: priced.deliveryFee,
    total: priced.total,
    paymentMethod: input.paymentMethod,
    deliveryAddress: {
      ...input.deliveryAddress,
      instructions: input.deliveryAddress.instructions ?? null,
    },
    deliveryCode: createDeliveryCode(),
    cashAmount: input.cashAmount ?? null,
    // Computed here, never accepted from the client: this figure decides
    // which drivers see the order, so a client that could set it could widen
    // its own driver pool.
    estimatedDistanceKm: estimateOrderDistanceKm(
      priced.storeCity,
      input.deliveryAddress.city,
    ),
    ...economics,
  };

  const order = await repository.create(document, 'customer');

  log.info(
    {
      orderId: order.id,
      customerId: caller.uid,
      storeId: order.storeId,
      total: order.total,
    },
    'Order placed.',
  );

  return order;
}

/**
 * Read one order.
 *
 * Access is by relationship, not by role: the customer who placed it, the
 * vendor who owns the store, the assigned driver, or an admin. Everyone else
 * gets a 404 rather than a 403, so order ids cannot be probed.
 */
export async function getOrder(
  caller: AuthContext,
  orderId: string,
): Promise<Order> {
  const raw = await repository.findRawById(orderId);
  if (!raw) throw ApiError.notFound('No such order.');

  const customerId = String(raw.customerId ?? '');
  const storeId = String(raw.storeId ?? '');
  const driverId = raw.driverId ? String(raw.driverId) : null;

  let permitted = caller.role === 'admin' || caller.uid === customerId;

  if (!permitted && caller.role === 'driver') {
    permitted = driverId === caller.uid;
  }

  if (!permitted && caller.role === 'vendor') {
    const store = await storeRepository.findByOwner(caller.uid);
    permitted = store?.id === storeId;
  }

  if (!permitted) throw ApiError.notFound('No such order.');

  const audience = audienceFor(caller, { customerId });
  const order = await repository.findById(orderId, audience);
  if (!order) throw ApiError.notFound('No such order.');

  // The delivery code no longer lives on the order document, so it has to be
  // fetched and attached — and only for the two audiences allowed to see it.
  // A driver or vendor never triggers this read at all.
  if (audience === 'customer' || audience === 'admin') {
    const code = await repository.findDeliveryCode(orderId);
    if (code) order.deliveryCode = code;
  }

  return order;
}

export async function listOwnOrders(
  caller: AuthContext,
  query: ListOrdersQuery,
): Promise<Page<Order>> {
  return repository.listForCustomer(caller.uid, {
    ...query,
    audience: 'customer',
  });
}

/** Orders placed with the calling vendor's store. */
export async function listStoreOrders(
  caller: AuthContext,
  query: ListOrdersQuery,
): Promise<Page<Order>> {
  const store = await storeRepository.findByOwner(caller.uid);
  if (!store) throw ApiError.notFound('You have not registered a store yet.');

  return repository.listForStore(store.id, { ...query, audience: 'vendor' });
}

/** Orders currently assigned to the calling driver. */
export async function listDriverOrders(
  caller: AuthContext,
  query: ListOrdersQuery,
): Promise<Page<Order>> {
  return repository.listForDriver(caller.uid, { ...query, audience: 'driver' });
}

/** The unclaimed queue drivers pick from. */
export async function listAvailableOrders(
  query: ListOrdersQuery,
): Promise<Page<Order>> {
  return repository.listAvailableForDrivers({ ...query, audience: 'driver' });
}

export async function listAllOrders(
  query: ListOrdersQuery,
): Promise<Page<Order>> {
  return repository.listAll({ ...query, audience: 'admin' });
}

/**
 * Move an order through its lifecycle.
 *
 * Authorisation is two-sided: the caller's role must be permitted to make
 * this particular transition, and they must be the party actually attached to
 * the order. A vendor may confirm orders, but only for their own store.
 */
export async function changeStatus(
  caller: AuthContext,
  orderId: string,
  next: OrderStatus,
  options: { expectedStage?: CancellationStage } = {},
): Promise<Order> {
  const order = await getOrder(caller, orderId);

  // Cancelling moves money, and how much depends on the stage the order has
  // reached, so it goes through the cancellation policy rather than a plain
  // status write. It is routed there before the transition check below: the
  // policy's transaction checks who may cancel itself, and it must be able to
  // see an already-cancelled order in order to finish a cancellation that was
  // interrupted — which an ordinary cancelled -> cancelled check would refuse.
  if (next === 'cancelled') {
    const cancelled = await cancellationService.cancelOrder({
      actor: caller,
      orderId,
      audience: audienceFor(caller, order),
      expectedStage: options.expectedStage,
    });
    log.info(
      { orderId, from: order.status, to: next, actor: caller.uid },
      'Order cancelled.',
    );
    return cancelled;
  }

  if (!canTransition(order.status, next, caller.role)) {
    throw ApiError.conflict(
      `You cannot move an order from ${order.status} to ${next}.`,
    );
  }

  // A customer may only cancel their own order; getOrder has already proven
  // the relationship for every other role.
  if (caller.role === 'driver' && order.driverId !== caller.uid) {
    throw ApiError.forbidden('This order is assigned to another driver.');
  }

  const updated = await repository.applyStatusChange(
    orderId,
    next,
    caller.role,
    audienceFor(caller, order),
  );

  log.info(
    { orderId, from: order.status, to: next, actor: caller.uid },
    'Order status changed.',
  );

  // The kitchen taking the order, and the food leaving with a driver, are
  // the two moments in this function a customer is waiting for. Each is
  // notified once, however many ways the order passes through it.
  if (next === 'confirmed' || next === 'preparing') {
    await notificationService.notifyCustomer({
      customerId: updated.customerId,
      orderId,
      kind: 'order_accepted',
      facts: { storeName: updated.storeName },
    });
  } else if (next === 'picked_up') {
    await notificationService.notifyCustomer({
      customerId: updated.customerId,
      orderId,
      kind: 'order_on_the_way',
      facts: { storeName: updated.storeName },
    });
  }

  return updated;
}

/** A driver claims an order from the available queue. */
export async function acceptOrder(
  caller: AuthContext,
  orderId: string,
): Promise<Order> {
  const order = await repository.findById(orderId, 'driver');
  if (!order) throw ApiError.notFound('No such order.');

  const assigned = await repository.assignDriver(orderId, caller.uid);

  log.info({ orderId, driverId: caller.uid }, 'Driver accepted order.');

  // Claiming food that is already waiting is the collection itself.
  if (assigned.status === 'picked_up') {
    await notificationService.notifyCustomer({
      customerId: assigned.customerId,
      orderId,
      kind: 'order_on_the_way',
      facts: { storeName: assigned.storeName },
    });
  }

  return assigned;
}

/** A driver gives up a claim before collecting the food. */
export async function releaseOrder(
  caller: AuthContext,
  orderId: string,
): Promise<Order> {
  const released = await repository.releaseDriver(orderId, caller.uid);
  log.info({ orderId, driverId: caller.uid }, 'Driver released order.');
  return released;
}

/**
 * A driver records handing the vendor their cash.
 *
 * The amount is computed from the order rather than sent by the driver — it
 * is what they owe, and a driver who could name it could under-declare.
 */
export async function recordCashHandover(
  caller: AuthContext,
  orderId: string,
): Promise<Order> {
  const order = await repository.recordCashHandover(orderId, caller.uid);

  log.info(
    { orderId, driverId: caller.uid, amount: order.cashGivenAmount },
    'Driver recorded cash handover.',
  );
  return order;
}

/**
 * A vendor confirms or disputes a driver's cash handover.
 *
 * Ownership is checked against the vendor's own store, so one vendor cannot
 * settle — or dispute — another's cash.
 */
export async function settleCashReceipt(
  caller: AuthContext,
  orderId: string,
  outcome: 'confirm' | 'dispute',
): Promise<Order> {
  // getOrder proves the caller is party to this order; for a vendor that
  // means they own the store it was placed with.
  const order = await getOrder(caller, orderId);

  if (caller.role === 'vendor' && order.storeId) {
    const store = await storeRepository.findByOwner(caller.uid);
    if (store?.id !== order.storeId) throw ApiError.notFound('No such order.');
  }

  // Confirming is the moment the kitchen's share changes hands, so it is
  // the moment the ledger records it. The transfer goes first, on purpose:
  // it is keyed to the order and safe to repeat, whereas the receipt below
  // refuses a second confirmation. The other order would strand a failure -
  // a receipt marked confirmed with the money never moved, and no way left
  // to retry it.
  //
  // A dispute moves nothing. The driver's wallet goes on showing that they
  // still owe the kitchen, which is exactly what a dispute claims.
  if (
    outcome === 'confirm' &&
    order.cashGivenToVendor &&
    !order.vendorCashConfirmed &&
    !order.vendorCashDisputed &&
    order.driverId
  ) {
    const store = await storeRepository.findById(order.storeId);
    if (!store) throw ApiError.notFound('No such order.');

    await walletService.recordCashHandover({
      orderId,
      vendorId: store.ownerId,
      driverId: order.driverId,
      amount: order.cashGivenAmount ?? order.subtotal,
    });
  }

  const settled = await repository.settleCashReceipt(orderId, outcome);

  log.warn(
    { orderId, vendorId: caller.uid, outcome },
    'Vendor settled a cash receipt.',
  );
  return settled;
}

/**
 * Confirm delivery against the customer's code.
 *
 * The driver submits a code they were never given by the API; the server
 * compares it against the order. A wrong code is not an error — it is an
 * expected outcome that burns one of a small number of attempts.
 */
export async function confirmDelivery(
  caller: AuthContext,
  orderId: string,
  code: string | undefined,
): Promise<DeliveryResult> {
  const result = await repository.completeDelivery(orderId, caller.uid, code);

  if (result.outcome === 'wrong_code') {
    log.warn(
      { orderId, driverId: caller.uid, attemptsRemaining: result.attemptsRemaining },
      'Incorrect delivery code submitted.',
    );
    return result;
  }

  log.info({ orderId, driverId: caller.uid }, 'Delivery confirmed.');

  // Money moves only now: the driver is paid and the vendor's pending
  // balance is released, because this is the point at which the handover
  // actually happened. Settlement is idempotent, so a retry is harmless.
  //
  // Deliberately not fatal to the request. The delivery is already recorded
  // and the customer has their food; a settlement failure is an operational
  // problem to retry, not a reason to tell the driver their delivery failed.
  try {
    await paymentService.settleDelivery(orderId);
  } catch (error) {
    log.error(
      { orderId, driverId: caller.uid, err: error },
      'Delivery recorded but settlement failed; wallets need reconciliation.',
    );
  }

  await notificationService.notifyCustomer({
    customerId: result.order.customerId,
    orderId,
    kind: 'order_delivered',
    facts: { storeName: result.order.storeName },
  });

  return result;
}

/**
 * What cancelling this order would cost the caller right now.
 *
 * Changes nothing. Access is the same as reading the order, so an order id
 * cannot be probed for its prices.
 */
export async function previewCancellation(
  caller: AuthContext,
  orderId: string,
): Promise<cancellationService.CancellationPreview> {
  await getOrder(caller, orderId);

  const raw = await repository.findRawById(orderId);
  if (!raw) throw ApiError.notFound('No such order.');

  return cancellationService.previewForOrder(raw, caller.role);
}
