/**
 * The kitchen's money, while a driver is holding it.
 *
 * On a cash order the platform never touches the money: the customer pays the
 * driver, the driver pays the kitchen, and between those two moments a
 * stranger is walking around with somebody else's takings. Until now "later"
 * was a perfectly good answer - the kitchen's only recourse was to ask, and
 * the app's only record was a line saying the cash had not arrived.
 *
 * So there is a deadline, `CASH_HANDOVER_HOURS` from delivery, and two things
 * happen when it passes:
 *
 *   - the driver cannot claim another delivery, which is immediate and needs
 *     nobody to run anything; and
 *   - the sweep suspends them, which is what makes the deadline mean
 *     something for a driver who has simply stopped working.
 *
 * Both are reversible by the money arriving. A kitchen confirming the cash is
 * what lifts an automatic suspension, and it can confirm without the driver
 * having recorded anything - a suspended driver cannot record anything, so
 * the debt would otherwise be impossible to clear.
 *
 * A dispute is deliberately not grounds for any of this. A kitchen that could
 * suspend a driver by disputing a handover would be a kitchen with a weapon;
 * disputes go to an admin instead.
 */

import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import * as notificationService from '../notifications/notification.service';
import * as userService from '../users/user.service';
import * as walletService from '../wallets/wallet.service';
import * as storeRepository from '../stores/store.repository';
import type { AuthContext } from '../../middleware/auth';
import { isCashOverdue, type Order } from './order.model';
import * as repository from './order.repository';

const log = moduleLogger('cash');

/** The way money is written everywhere a person reads it. */
function rands(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

/** What a driver still owes, and what of it is late. */
export type OutstandingCash = {
  orders: Order[];
  overdue: Order[];
  total: number;
  overdueTotal: number;
  /** The soonest deadline still to come, for the one the driver should do next. */
  nextDueAt: string | null;
};

function owed(order: Order): number {
  return order.cashGivenAmount ?? order.subtotal;
}

export async function outstandingFor(
  driverId: string,
  now: Date = new Date(),
): Promise<OutstandingCash> {
  const orders = await repository.listUnsettledCash({ driverId });
  return summarise(orders, now);
}

function summarise(orders: Order[], now: Date): OutstandingCash {
  const overdue = orders.filter((order) => isCashOverdue(order.deliveredAt, now));

  const dues = orders
    .map((order) => order.cashDueAt)
    .filter((due): due is string => due !== null)
    .sort();

  return {
    orders,
    overdue,
    total: round(orders.reduce((sum, order) => sum + owed(order), 0)),
    overdueTotal: round(overdue.reduce((sum, order) => sum + owed(order), 0)),
    nextDueAt: dues[0] ?? null,
  };
}

/** Rands, not floating-point dust. */
function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Stop a driver taking more work while a kitchen is still waiting.
 *
 * The teeth that need no scheduler: whatever else happens, nobody carries a
 * second kitchen's dinner while they are late paying the first.
 */
export async function assertNothingOverdue(driverId: string): Promise<void> {
  const outstanding = await outstandingFor(driverId);
  if (outstanding.overdue.length === 0) return;

  const kitchens = new Set(outstanding.overdue.map((order) => order.storeName));
  const names = [...kitchens].filter(Boolean);

  throw ApiError.forbidden(
    `Hand over the ${rands(outstanding.overdueTotal)} you are holding for ${
      names.length === 1 ? names[0] : `${kitchens.size} kitchens`
    } before taking another delivery.`,
  );
}

export type SweepResult = {
  checked: number;
  overdue: number;
  suspended: string[];
  alreadySuspended: string[];
};

/**
 * Suspend every driver whose deadline has passed.
 *
 * Run on a schedule, and by an admin by hand. Safe to run as often as you
 * like: suspending somebody already suspended changes nothing, and a driver
 * with nothing overdue is never touched.
 */
export async function sweepOverdue(now: Date = new Date()): Promise<SweepResult> {
  const unsettled = await repository.listUnsettledCash();
  const overdue = unsettled.filter((order) =>
    isCashOverdue(order.deliveredAt, now),
  );

  const byDriver = new Map<string, Order[]>();
  for (const order of overdue) {
    if (!order.driverId) continue;
    byDriver.set(order.driverId, [...(byDriver.get(order.driverId) ?? []), order]);
  }

  const result: SweepResult = {
    checked: unsettled.length,
    overdue: overdue.length,
    suspended: [],
    alreadySuspended: [],
  };

  for (const [driverId, orders] of byDriver) {
    const total = round(orders.reduce((sum, order) => sum + owed(order), 0));
    const reason = `Has not handed over ${rands(total)} from ${
      orders.length === 1 ? 'a delivery' : `${orders.length} deliveries`
    }.`;

    const suspended = await userService.suspendForUnsettledCash(driverId, reason);

    if (suspended) {
      result.suspended.push(driverId);
      log.warn({ driverId, total, orders: orders.length }, 'Driver suspended over unsettled cash.');

      // Said plainly, and before they find out by being unable to sign in.
      await notificationService
        .notifyDrivers({
          driverIds: [driverId],
          orderId: orders[0]?.id ?? null,
          kind: 'driver_suspended_cash',
          facts: { storeName: '', decisionReason: reason },
        })
        .catch((error: unknown) => {
          log.warn({ driverId, err: error }, 'Could not tell them why.');
        });
    } else {
      result.alreadySuspended.push(driverId);
    }
  }

  log.info(result, 'Cash sweep finished.');
  return result;
}

/**
 * Cash a kitchen says never arrived, waiting on somebody to decide.
 *
 * A dispute is two people saying opposite things about money neither of them
 * can prove, so nothing automatic follows from it: a kitchen that could
 * suspend a driver by disputing would be a kitchen with a weapon. What it
 * must not do is disappear, which is what it did until now - the order left
 * the driver's "you owe" list and the kitchen's "owed to you" total, and read
 * on both sides as settled.
 */
export async function listDisputed(): Promise<Order[]> {
  return repository.listDisputedCash();
}

/**
 * An admin decides a disputed handover.
 *
 * Upholding it puts the driver back where they were before they said they had
 * paid: owing the money, under a deadline that has long since passed, which
 * is what blocks them from taking more work. Dismissing it closes the matter
 * in the driver's favour and moves the money, exactly as a confirmation does.
 */
export async function resolveDispute(
  actor: AuthContext,
  orderId: string,
  outcome: 'uphold' | 'dismiss',
  note: string | null,
): Promise<Order> {
  const before = await repository.findById(orderId, 'admin');
  if (!before) throw ApiError.notFound('No such order.');
  if (!before.vendorCashDisputed) {
    throw ApiError.conflict('This cash is not in dispute.');
  }

  // The money moves first, for the same reason a confirmation does: the
  // transfer is keyed to the order and safe to repeat, while the write below
  // refuses a second go. The other way round could leave a resolved dispute
  // whose money never moved, with no way left to retry it.
  if (outcome === 'dismiss' && before.driverId) {
    const store = await storeRepository.findById(before.storeId);
    if (!store) throw ApiError.notFound('No such order.');

    await walletService.recordCashHandover({
      orderId,
      vendorId: store.ownerId,
      driverId: before.driverId,
      amount: before.cashGivenAmount ?? before.subtotal,
    });
  }

  const resolved = await repository.resolveCashDispute(
    orderId,
    outcome,
    actor.uid,
    note,
  );

  log.warn(
    { orderId, outcome, by: actor.uid, driverId: resolved.driverId },
    'Cash dispute resolved.',
  );

  if (resolved.driverId) {
    await notificationService
      .notifyDrivers({
        driverIds: [resolved.driverId],
        orderId,
        kind: outcome === 'uphold' ? 'cash_due_soon' : 'order_completed',
        facts: {
          storeName: resolved.storeName,
          cashHandedOver: before.cashGivenAmount ?? before.subtotal,
        },
      })
      .catch((error: unknown) =>
        log.warn({ orderId, err: error }, 'Could not tell the driver.'),
      );

    // Dismissed: they may have been suspended over this very order.
    if (outcome === 'dismiss') await reinstateIfSettled(resolved.driverId);
  }

  return resolved;
}

/**
 * Let a driver back in once the money has arrived.
 *
 * Only lifts a suspension this module imposed - an admin who suspended
 * somebody for taking a customer's phone is not overruled by a kitchen
 * confirming a separate R55.
 */
export async function reinstateIfSettled(driverId: string): Promise<boolean> {
  const outstanding = await outstandingFor(driverId);
  if (outstanding.overdue.length > 0) return false;

  const lifted = await userService.liftCashSuspension(driverId);
  if (lifted) {
    log.info({ driverId }, 'Cash settled; automatic suspension lifted.');
  }
  return lifted;
}
