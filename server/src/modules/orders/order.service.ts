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
import { createDeliveryCode } from '../../lib/otp';
import type { Page } from '../../lib/pagination';
import type { AuthContext } from '../../middleware/auth';
import * as productRepository from '../products/product.repository';
import * as storeRepository from '../stores/store.repository';
import * as userRepository from '../users/user.repository';
import {
  canTransition,
  type Audience,
  type CreateOrderInput,
  type ListOrdersQuery,
  type Order,
  type OrderStatus,
} from './order.model';
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

  return { items, subtotal, deliveryFee, total, storeName: store.name };
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
  const priced = await priceOrder(input);

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

  const order = await repository.findById(
    orderId,
    audienceFor(caller, { customerId }),
  );
  if (!order) throw ApiError.notFound('No such order.');
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
): Promise<Order> {
  const order = await getOrder(caller, orderId);

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
  return assigned;
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
  code: string,
): Promise<DeliveryResult> {
  const result = await repository.completeDelivery(orderId, caller.uid, code);

  if (result.outcome === 'wrong_code') {
    log.warn(
      { orderId, driverId: caller.uid, attemptsRemaining: result.attemptsRemaining },
      'Incorrect delivery code submitted.',
    );
  } else {
    log.info({ orderId, driverId: caller.uid }, 'Delivery confirmed.');
  }

  return result;
}
