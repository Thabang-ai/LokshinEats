/**
 * Telling a customer what happened to their order.
 *
 * Every notification is stored first - that is the in-app inbox, and it works
 * whether or not push is configured - and then pushed to the customer's
 * devices when there are any and a push service is set up.
 *
 * Nothing here is allowed to fail the thing that caused it. A kitchen
 * accepting an order, a driver delivering it: those have happened whether or
 * not the customer's phone heard about it, so errors are logged, never thrown
 * back into the order flow.
 */

import { moduleLogger } from '../../config/logger';
import type { Page } from '../../lib/pagination';
import type { AuthContext } from '../../middleware/auth';
import {
  messageFor,
  type Notification,
  type NotificationKind,
  type OrderFacts,
} from './notification.model';
import * as repository from './notification.repository';
import { pushSender } from './push';

const log = moduleLogger('notifications');

/**
 * Notify an order's customer that something happened to it.
 *
 * `push: false` records it in the inbox without buzzing the phone - for
 * something the customer just did themselves, where a notification about
 * their own tap would be noise but the record (a refund amount, say) is
 * still worth keeping.
 */
export async function notifyCustomer(input: {
  customerId: string;
  orderId: string;
  kind: NotificationKind;
  facts: OrderFacts;
  push?: boolean;
}): Promise<void> {
  await notifyUser({ ...input, userId: input.customerId, audience: 'customer' });
}

/**
 * Notify a kitchen about an order of theirs.
 *
 * The one notification a vendor cannot do without: until this existed, a
 * kitchen learned an order had arrived by happening to be looking at a
 * screen.
 */
export async function notifyVendor(input: {
  vendorId: string;
  orderId: string;
  kind: NotificationKind;
  facts: OrderFacts;
}): Promise<void> {
  await notifyUser({ ...input, userId: input.vendorId, audience: 'kitchen' });
}

/**
 * Tell drivers a delivery is there to claim.
 *
 * Sent to every driver, because any of them may take it - the first to claim
 * it gets it, and the rest find it gone, which is how the board already
 * works. Each driver's inbox records it once.
 */
export async function notifyDrivers(input: {
  driverIds: string[];
  orderId: string;
  kind: NotificationKind;
  facts: OrderFacts;
}): Promise<void> {
  await Promise.all(
    input.driverIds.map((driverId) =>
      notifyUser({
        userId: driverId,
        orderId: input.orderId,
        kind: input.kind,
        facts: input.facts,
        audience: 'driver',
      }),
    ),
  );
}

/**
 * Store a notification and, unless told otherwise, push it.
 *
 * `audience` is only for the log line: whose phone failed to buzz is the
 * first thing worth knowing when one of these goes wrong.
 */
async function notifyUser(input: {
  userId: string;
  orderId: string;
  kind: NotificationKind;
  facts: OrderFacts;
  push?: boolean;
  audience: string;
}): Promise<void> {
  if (!input.userId) return;

  try {
    const message = messageFor(input.kind, input.facts);
    const { created } = await repository.createOnce({
      userId: input.userId,
      orderId: input.orderId,
      message,
    });

    // Already told them about this moment; do not buzz them twice.
    if (!created || input.push === false) return;

    const tokens = await repository.tokensFor(input.userId);
    if (tokens.length === 0) return;

    const sender = pushSender();
    const { deadTokens } = await sender.send(tokens, {
      ...message,
      orderId: input.orderId,
    });

    if (deadTokens.length > 0) {
      await repository.forgetTokens(deadTokens);
      log.info(
        { userId: input.userId, forgotten: deadTokens.length },
        'Forgot devices that no longer accept push.',
      );
    }
  } catch (error) {
    log.error(
      {
        orderId: input.orderId,
        kind: input.kind,
        audience: input.audience,
        err: error,
      },
      'Could not send a notification; the order itself is unaffected.',
    );
  }
}

export async function listMine(
  caller: AuthContext,
  options: { limit: number; cursor?: string },
): Promise<{ page: Page<Notification>; unread: number }> {
  const [page, unread] = await Promise.all([
    repository.listForUser(caller.uid, options),
    repository.countUnread(caller.uid),
  ]);
  return { page, unread };
}

export async function markRead(
  caller: AuthContext,
  id: string,
): Promise<Notification | null> {
  return repository.markRead(caller.uid, id);
}

export async function markAllRead(caller: AuthContext): Promise<number> {
  return repository.markAllRead(caller.uid);
}

export async function registerDevice(
  caller: AuthContext,
  input: { token: string; platform: string },
): Promise<void> {
  await repository.upsertDevice({ userId: caller.uid, ...input });
}

export async function removeDevice(
  caller: AuthContext,
  token: string,
): Promise<void> {
  await repository.removeDevice(caller.uid, token);
}
