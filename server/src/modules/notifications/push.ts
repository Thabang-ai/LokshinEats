/**
 * Push delivery, behind one small interface.
 *
 * "fcm" sends through Firebase Cloud Messaging. "off" sends nothing: the
 * notification is still stored and the in-app inbox still shows it, which is
 * the right default while a deployment has no push credentials - and the only
 * option against the emulators, which have no messaging service.
 *
 * Swappable for tests the same way payment providers are, so the decision of
 * what to push, and to whom, can be checked without sending anything.
 */

import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../../config/env';
import { firebaseApp } from '../../config/firebase';
import { moduleLogger } from '../../config/logger';
import type { NotificationMessage } from './notification.model';

const log = moduleLogger('notifications:push');

export type PushPayload = NotificationMessage & { orderId: string | null };

export type PushResult = {
  /** Tokens the service says will never deliver again. Safe to forget. */
  deadTokens: string[];
};

export interface PushSender {
  readonly name: string;
  send(tokens: string[], payload: PushPayload): Promise<PushResult>;
}

/** Stores nothing extra and sends nothing. The inbox is the notification. */
export const disabledSender: PushSender = {
  name: 'off',
  async send() {
    return { deadTokens: [] };
  },
};

/** Codes that mean a token is gone for good, not a passing failure. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export const fcmSender: PushSender = {
  name: 'fcm',
  async send(tokens, payload) {
    if (tokens.length === 0) return { deadTokens: [] };

    const response = await getMessaging(firebaseApp).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      // Enough for the app to open the right screen when it is tapped.
      data: {
        kind: payload.kind,
        ...(payload.orderId ? { orderId: payload.orderId } : {}),
      },
    });

    const deadTokens: string[] = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code ?? '';
      if (DEAD_TOKEN_CODES.has(code)) {
        deadTokens.push(tokens[index]!);
      } else {
        log.warn({ code }, 'Push failed for one device.');
      }
    });

    return { deadTokens };
  },
};

let active: PushSender | null = null;

/** The configured sender, chosen once from PUSH_PROVIDER. */
export function pushSender(): PushSender {
  active ??= env.PUSH_PROVIDER === 'fcm' ? fcmSender : disabledSender;
  return active;
}

/** For tests: send through something that records instead. */
export function usePushSender(sender: PushSender): void {
  active = sender;
}

export function resetPushSender(): void {
  active = null;
}
