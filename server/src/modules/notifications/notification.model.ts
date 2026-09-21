/**
 * Customer notifications: what we tell someone about their order, and when.
 *
 * Four moments a customer actually waits for - the kitchen taking the order,
 * the food leaving with a driver, it arriving, and it being cancelled - and
 * nothing in between. A notification for every status change trains people
 * to ignore them.
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
  'order_accepted',
  'order_on_the_way',
  'order_delivered',
  'order_cancelled',
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

export const registerDeviceSchema = z
  .object({
    /** The FCM registration token the device was issued. */
    token: z.string().trim().min(20).max(4096),
    platform: z.enum(DEVICE_PLATFORMS),
  })
  .strict();

export const removeDeviceSchema = z
  .object({ token: z.string().trim().min(20).max(4096) })
  .strict();
