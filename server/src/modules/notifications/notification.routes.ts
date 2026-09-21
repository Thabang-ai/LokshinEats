/**
 * Notification routes. Everything here is about the caller's own account.
 *
 * | Method | Path                               | Who            |
 * |--------|------------------------------------|----------------|
 * | GET    | /notifications                     | signed in      |
 * | POST   | /notifications/:id/read            | signed in      |
 * | POST   | /notifications/read-all            | signed in      |
 * | POST   | /notifications/devices             | signed in      |
 * | POST   | /notifications/devices/remove      | signed in      |
 */

import { Router } from 'express';
import { ApiError } from '../../lib/ApiError';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  registerDeviceSchema,
  removeDeviceSchema,
} from './notification.model';
import * as service from './notification.service';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

/** Newest first, with how many are unread for the badge. */
notificationRouter.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query as unknown as {
      limit: number;
      cursor?: string;
    };
    const { page, unread } = await service.listMine(requireAuth(req), {
      limit,
      cursor,
    });
    res.json({
      data: page.items,
      nextCursor: page.nextCursor,
      meta: { unread },
    });
  }),
);

// Declared before /:id/read so "read-all" is never read as an id.
notificationRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const updated = await service.markAllRead(requireAuth(req));
    res.json({ data: { updated } });
  }),
);

notificationRouter.post(
  '/:id/read',
  validate({ params: notificationIdParamSchema }),
  asyncHandler(async (req, res) => {
    const notification = await service.markRead(
      requireAuth(req),
      req.params.id as string,
    );
    if (!notification) throw ApiError.notFound('No such notification.');
    res.json({ data: notification });
  }),
);

/**
 * Register this device for push. Sent by the app after sign-in and whenever
 * the push service rotates the token.
 */
notificationRouter.post(
  '/devices',
  validate({ body: registerDeviceSchema }),
  asyncHandler(async (req, res) => {
    await service.registerDevice(requireAuth(req), req.body);
    res.status(204).send();
  }),
);

/** Stop pushing to this device - sent on sign-out. */
notificationRouter.post(
  '/devices/remove',
  validate({ body: removeDeviceSchema }),
  asyncHandler(async (req, res) => {
    await service.removeDevice(requireAuth(req), req.body.token);
    res.status(204).send();
  }),
);
