/**
 * A day's money, added up and checked.
 *
 * The question this answers is not "how much did we make" - that number on
 * its own has misled every operator who has ever read it. It is four
 * different quantities that a single figure hides:
 *
 *   - what customers paid;
 *   - how much of that was never ours, because a driver took it at the door
 *     in cash and owes it to a kitchen;
 *   - what the kitchens and drivers are owed or have been paid; and
 *   - what the platform actually earned.
 *
 * Every order carries its own split, frozen when it was placed, and that
 * split is guaranteed to balance to the cent at the moment of pricing. This
 * re-checks it afterwards and names any order that does not add up, because
 * an invariant nobody re-reads is a hope rather than a guarantee.
 */

import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import { sumRands, toCents, toRands } from '../../lib/money';
import type { Order } from '../orders/order.model';
import * as orderRepository from '../orders/order.repository';

const log = moduleLogger('reports');

export type DayReconciliation = {
  /** The day reported, as given: YYYY-MM-DD. */
  date: string;
  orders: { total: number; cash: number; card: number; cancelled: number };
  /**
   * What customers paid, split by who physically received it. Card money
   * reaches the platform; cash never does - a driver takes it at the door.
   */
  collected: { total: number; card: number; cash: number };
  /** What that money owes to each party, by the splits frozen on the orders. */
  distributed: {
    vendorPayouts: number;
    driverPay: number;
    platformRevenue: number;
  };
  refunds: { total: number; count: number };
  /**
   * Cash collected at a door that has not reached its kitchen yet. Not a
   * loss and not revenue - somebody is carrying it.
   */
  cashInDriverHands: { amount: number; orders: number };
  /**
   * Orders whose own split does not add up. Empty is the only acceptable
   * answer; anything here is a real discrepancy, named so it can be chased.
   */
  unbalanced: Array<{ orderId: string; paid: number; distributed: number }>;
  /** True when every order in the day balances. */
  balances: boolean;
};

/** A calendar day in South Africa, which is where every order is placed. */
const SAST_OFFSET_HOURS = 2;

/** The UTC instants that bracket a South African calendar day. */
export function dayBounds(date: string): { from: Date; to: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw ApiError.badRequest('Give the day as YYYY-MM-DD.');
  }

  const from = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime())) {
    throw ApiError.badRequest('That is not a real date.');
  }

  // Midnight in Johannesburg, not midnight UTC: a report headed "24 November"
  // that starts at 02:00 that morning is a report that loses two hours of
  // orders every day and never says so.
  from.setUTCHours(from.getUTCHours() - SAST_OFFSET_HOURS);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

/** Money the customer handed over for this order, whatever happened after. */
function paidFor(order: Order): number {
  return toRands(
    toCents(order.subtotal, 'subtotal') + toCents(order.deliveryFee, 'deliveryFee'),
  );
}

export async function reconcileDay(date: string): Promise<DayReconciliation> {
  const { from, to } = dayBounds(date);
  const orders = await orderRepository.listPlacedBetween(from, to);

  const cash = orders.filter((order) => order.paymentMethod === 'cash');
  const card = orders.filter((order) => order.paymentMethod !== 'cash');

  // A cancelled order still appears in the count, because "we took 40 orders
  // and 6 were cancelled" is the sentence an operator needs. Its money is
  // whatever the cancellation tiers decided, which is already on the order.
  const cancelled = orders.filter((order) => order.status === 'cancelled');

  const unbalanced: DayReconciliation['unbalanced'] = [];
  for (const order of orders) {
    const paid = toCents(paidFor(order), 'paid');
    const distributed =
      toCents(order.vendorPayout, 'vendorPayout') +
      toCents(order.driverPayout, 'driverPayout') +
      toCents(order.platformEarnings, 'platformEarnings');

    if (paid !== distributed) {
      unbalanced.push({
        orderId: order.id,
        paid: toRands(paid),
        distributed: toRands(distributed),
      });
    }
  }

  const owedCash = cash.filter(
    (order) =>
      order.status === 'delivered' &&
      !order.cashGivenToVendor &&
      !order.vendorCashConfirmed,
  );

  const report: DayReconciliation = {
    date,
    orders: {
      total: orders.length,
      cash: cash.length,
      card: card.length,
      cancelled: cancelled.length,
    },
    collected: {
      total: sumRands(orders.map(paidFor)),
      card: sumRands(card.map(paidFor)),
      cash: sumRands(cash.map(paidFor)),
    },
    distributed: {
      vendorPayouts: sumRands(orders.map((order) => order.vendorPayout)),
      driverPay: sumRands(orders.map((order) => order.driverPayout)),
      platformRevenue: sumRands(orders.map((order) => order.platformEarnings)),
    },
    refunds: {
      total: sumRands(orders.map((order) => order.refundedAmount)),
      count: orders.filter((order) => order.refundedAmount > 0).length,
    },
    cashInDriverHands: {
      amount: sumRands(owedCash.map((order) => order.subtotal)),
      orders: owedCash.length,
    },
    unbalanced,
    balances: unbalanced.length === 0,
  };

  if (!report.balances) {
    log.error(
      { date, unbalanced: report.unbalanced },
      'A day did not reconcile.',
    );
  }

  return report;
}
