/**
 * Notifications: what we tell someone about an order, and when.
 *
 * Four moments a customer actually waits for - the kitchen taking the order,
 * the food leaving with a driver, it arriving, and it being cancelled - and
 * nothing in between. A notification for every status change trains people
 * to ignore them.
 *
 * Two more for the people working the order, each the moment their own job
 * starts: a kitchen learning an order exists, and drivers learning a
 * delivery is there to claim. Without these a kitchen only finds out by
 * watching a screen, which is how a real order gets missed.
 *
 * The words are decided here, from the order's own facts, so the push, the
 * in-app inbox and anything else that shows a notification say the same
 * thing. One rule is absolute: a notification never carries the delivery
 * code. Pushes appear on lock screens, and the code is the customer's proof
 * that the food reached them.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { paginationSchema } from '../../lib/pagination';
import { toIso, toStringOr } from '../../lib/serialize';

export const NOTIFICATION_KINDS = [
  // To the customer.
  'order_accepted',
  'order_on_the_way',
  'order_delivered',
  'order_cancelled',
  // To the kitchen, and to drivers.
  'order_placed',
  'delivery_available',
  'delivery_taken',
  'driver_assigned',
  'order_collected',
  'order_completed',
  'cash_handover_claimed',
  // To a driver, about themselves rather than about an order.
  'driver_approved',
  'driver_rejected',
  'cash_due_soon',
  'driver_suspended_cash',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  orderId: string | null;
  createdAt: string | null;
  /** Null until the customer has seen it in the app. */
  readAt: string | null;
};

/** What a notification says, before it is stored or sent. */
export type NotificationMessage = {
  kind: NotificationKind;
  title: string;
  body: string;
};

/** The facts about an order that decide the wording. */
export type OrderFacts = {
  storeName: string;
  /** Rands refunded to the customer's wallet by a cancellation. */
  refundedAmount?: number;
  /** The customer paid up front, so a cancellation may have cost them. */
  prepaid?: boolean;
  /** What the order comes to, for the kitchen's notification. */
  orderTotal?: number;
  /** How many dishes, so a kitchen knows the size of the job at a glance. */
  itemCount?: number;
  /** What the delivery pays, which is what decides a driver to claim it. */
  driverEarnings?: number;
  /** Who is collecting, for the kitchen expecting them. */
  driverName?: string;
  /** What the kitchen is owed for the order, once delivery releases it. */
  vendorPayout?: number;
  /** What a driver says they handed the kitchen in cash. */
  cashHandedOver?: number;
  /** Why an application was turned down, in the admin's own words. */
  decisionReason?: string;
};

function rands(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

/** The words for one moment in an order's life. */
export function messageFor(
  kind: NotificationKind,
  facts: OrderFacts,
): NotificationMessage {
  const kitchen = facts.storeName.trim() || 'The kitchen';

  switch (kind) {
    case 'order_accepted':
      return {
        kind,
        title: `${kitchen} is making your order`,
        body: 'They have accepted it and started cooking.',
      };

    case 'order_on_the_way':
      return {
        kind,
        title: 'Your order is on the way',
        // Deliberately not the code itself: this may be read off a locked
        // phone by anyone holding it.
        body: 'Your driver will ask for your delivery code. Open the app to see it.',
      };

    case 'order_delivered':
      return {
        kind,
        title: 'Delivered',
        body: `Enjoy your meal from ${kitchen}.`,
      };

    case 'order_placed': {
      const items = facts.itemCount ?? 0;
      const total = facts.orderTotal ?? 0;
      return {
        kind,
        title: 'New order',
        body:
          items > 0
            ? `${items} ${items === 1 ? 'item' : 'items'}, ${rands(total)}. Accept it to start cooking.`
            : `${rands(total)}. Accept it to start cooking.`,
      };
    }

    case 'delivery_available': {
      const pay = facts.driverEarnings ?? 0;
      return {
        kind,
        title: 'Delivery available',
        body:
          pay > 0
            ? `Collect from ${kitchen} - ${rands(pay)}.`
            : `Collect from ${kitchen}.`,
      };
    }

    case 'delivery_taken':
      return {
        kind,
        title: 'Delivery taken',
        // Said plainly rather than left to a board that refreshes later: a
        // driver who sets off for a job someone else has wastes a trip.
        body: `Another driver got the ${kitchen} delivery.`,
      };

    case 'driver_assigned': {
      const driver = facts.driverName?.trim();
      return {
        kind,
        title: 'A driver is coming',
        body: driver
          ? `${driver} is on the way to collect this order.`
          : 'A driver is on the way to collect this order.',
      };
    }

    case 'order_collected':
      return {
        kind,
        title: 'Order collected',
        body: 'The driver has the food and is on the way to the customer.',
      };

    case 'order_completed': {
      const payout = facts.vendorPayout ?? 0;
      return {
        kind,
        title: 'Delivered',
        body:
          payout > 0
            ? `${rands(payout)} has been released to your wallet.`
            : 'The customer has their food.',
      };
    }

    case 'cash_handover_claimed': {
      const amount = facts.cashHandedOver ?? 0;
      return {
        kind,
        // The one moment in an order that needs the kitchen to answer: until
        // they confirm it, the driver's balance still says they owe it.
        title: 'Confirm the cash',
        body: amount > 0
            ? `Your driver says they paid you ${rands(amount)}. Confirm you got it.`
            : 'Your driver says they paid you for this order. Confirm you got it.',
      };
    }

    case 'driver_approved':
      return {
        kind,
        title: 'You are approved',
        body: 'You can start taking deliveries now.',
      };

    case 'cash_due_soon':
      return {
        kind,
        title: 'A kitchen is waiting for its cash',
        body: `Hand ${kitchen} the ${rands(
          facts.cashHandedOver ?? 0,
        )} you collected. Your account is suspended if you do not.`,
      };

    case 'driver_suspended_cash':
      return {
        kind,
        title: 'Your account is suspended',
        // The amount and the way back, in the same breath: a suspension that
        // does not say how to end it is one that just ends somebody's work.
        body:
          `${facts.decisionReason?.trim() ?? 'Cash is outstanding.'} ` +
          'Hand it over and ask the kitchen to confirm, and you are back on.',
      };

    case 'driver_rejected':
      return {
        kind,
        title: 'Your application was turned down',
        // The reason, always: an application that fails silently is one the
        // person submits again unchanged.
        body:
          facts.decisionReason?.trim() ||
          'Check your details and apply again.',
      };

    case 'order_cancelled': {
      const refund = facts.refundedAmount ?? 0;
      return {
        kind,
        title: 'Your order was cancelled',
        body:
          refund > 0
            ? `${rands(refund)} is back in your LokshinEats wallet.`
            : facts.prepaid
              ? 'It was cancelled after your food left the kitchen, so there is no refund.'
              : 'You have not been charged.',
      };
    }
  }
}

export function toNotification(snapshot: DocumentSnapshot): Notification {
  const data = snapshot.data() ?? {};
  const kind = NOTIFICATION_KINDS.includes(data.kind as NotificationKind)
    ? (data.kind as NotificationKind)
    : 'order_accepted';

  return {
    id: snapshot.id,
    kind,
    title: toStringOr(data.title),
    body: toStringOr(data.body),
    orderId: typeof data.orderId === 'string' ? data.orderId : null,
    createdAt: toIso(data.createdAt),
    readAt: toIso(data.readAt),
  };
}

export const listNotificationsQuerySchema = paginationSchema;

export const notificationIdParamSchema = z.object({
  id: z.string().trim().min(1).max(200),
});

export const DEVICE_PLATFORMS = ['android', 'ios', 'web'] as const;

/**
 * Which of the three apps a device is running.
 *
 * One person may be a customer on their own phone and a driver on the same
 * one. Each install gets its own token, and recording which app it belongs
 * to is what stops a delivery offer appearing in the app they order dinner
 * with. Optional: installs that registered before this existed keep working,
 * and are sent everything their account is entitled to.
 */
export const DEVICE_APPS = ['customer', 'driver', 'vendor'] as const;
export type DeviceApp = (typeof DEVICE_APPS)[number];

export const registerDeviceSchema = z
  .object({
    /** The FCM registration token the device was issued. */
    token: z.string().trim().min(20).max(4096),
    platform: z.enum(DEVICE_PLATFORMS),
    app: z.enum(DEVICE_APPS).optional(),
  })
  .strict();

export const removeDeviceSchema = z
  .object({ token: z.string().trim().min(20).max(4096) })
  .strict();
