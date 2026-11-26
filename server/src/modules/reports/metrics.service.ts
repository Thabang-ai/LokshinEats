/**
 * The numbers an operator opens the console to see.
 *
 * Three questions, kept apart on purpose:
 *
 *   - **Today**: what has happened since midnight in Johannesburg. Money
 *     here is the same money the reconciliation reports, read from the same
 *     orders, so the dashboard and the report can never disagree.
 *   - **Right now**: what is in flight and what is waiting for a person -
 *     a kitchen nobody has reviewed, a dispute nobody has ruled on, a
 *     delivery nobody has claimed. This is the part an operator acts on.
 *   - **Altogether**: how big the platform is.
 *
 * Counts use Firestore's `count()` aggregation rather than reading the
 * documents: the number of customers is one query either way, but only one
 * of them stays cheap as the platform grows.
 */

import { Collections, db } from '../../config/firebase';
import { sumRands } from '../../lib/money';
import type { Order } from '../orders/order.model';
import * as orderRepository from '../orders/order.repository';
import { dayBounds } from './reconciliation.service';

export type PlatformMetrics = {
  /** The South African calendar day these "today" figures cover. */
  date: string;
  today: {
    orders: number;
    delivered: number;
    cancelled: number;
    /** What customers paid for orders placed today, cancellations aside. */
    takings: number;
    /** The platform's own share of them. */
    platformShare: number;
  };
  /** Orders in flight right now, whenever they were placed. */
  live: {
    pending: number;
    preparing: number;
    ready: number;
    onTheWay: number;
    /** Accepted by a kitchen, and no driver has taken it yet. */
    unclaimed: number;
  };
  /** Things waiting for a person to decide. */
  waiting: {
    kitchens: number;
    drivers: number;
    cashDisputes: number;
  };
  totals: {
    kitchens: number;
    drivers: number;
    customers: number;
  };
};

/** Today, in Johannesburg, as YYYY-MM-DD. */
export function todayInSast(at: Date = new Date()): string {
  const sast = new Date(at.getTime() + 2 * 60 * 60 * 1000);
  return sast.toISOString().slice(0, 10);
}

async function countWhere(
  collection: string,
  field: string,
  value: string,
): Promise<number> {
  const snapshot = await db
    .collection(collection)
    .where(field, '==', value)
    .count()
    .get();
  return snapshot.data().count;
}

async function countAll(collection: string): Promise<number> {
  const snapshot = await db.collection(collection).count().get();
  return snapshot.data().count;
}

/** Orders that have not finished, whenever they were placed. */
async function countLive(): Promise<PlatformMetrics['live']> {
  const [pending, preparing, ready, onTheWay] = await Promise.all([
    countWhere(Collections.orders, 'status', 'pending'),
    countWhere(Collections.orders, 'status', 'preparing'),
    countWhere(Collections.orders, 'status', 'ready'),
    countWhere(Collections.orders, 'status', 'picked_up'),
  ]);

  // Not a count query: "nobody has claimed it" is driverId == null beside a
  // status filter, which is the same shape as the drivers' own board.
  const unclaimed = await orderRepository.listAvailableForDrivers({
    audience: 'admin',
    limit: 100,
  });

  return {
    pending,
    preparing,
    ready,
    onTheWay,
    unclaimed: unclaimed.items.length,
  };
}

/** What customers paid for an order, however they paid it. */
function paidFor(order: Order): number {
  return order.status === 'cancelled' ? 0 : order.total;
}

export async function platformMetrics(
  date: string = todayInSast(),
): Promise<PlatformMetrics> {
  const { from, to } = dayBounds(date);

  const [orders, live, kitchensWaiting, driversWaiting, disputes] =
    await Promise.all([
      orderRepository.listPlacedBetween(from, to),
      countLive(),
      // A kitchen with no verification field predates the review queue and is
      // not waiting for anybody; only an explicit 'pending' is.
      countWhere(Collections.stores, 'verification', 'pending'),
      countWhere(Collections.drivers, 'status', 'pending'),
      orderRepository.listDisputedCash(200),
    ]);

  const [kitchens, drivers, customers] = await Promise.all([
    countAll(Collections.stores),
    countAll(Collections.drivers),
    countWhere(Collections.users, 'role', 'customer'),
  ]);

  const delivered = orders.filter((order) => order.status === 'delivered');
  const cancelled = orders.filter((order) => order.status === 'cancelled');

  return {
    date,
    today: {
      orders: orders.length,
      delivered: delivered.length,
      cancelled: cancelled.length,
      takings: sumRands(orders.map(paidFor)),
      platformShare: sumRands(
        orders
          .filter((order) => order.status !== 'cancelled')
          .map((order) => order.platformEarnings),
      ),
    },
    live,
    waiting: {
      kitchens: kitchensWaiting,
      drivers: driversWaiting,
      cashDisputes: disputes.length,
    },
    totals: { kitchens, drivers, customers },
  };
}
