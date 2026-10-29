/**
 * User routes.
 *
 * | Method | Path                  | Access                      |
 * |--------|-----------------------|-----------------------------|
 * | POST   | /users/me             | any authenticated account   |
 * | GET    | /users/me             | any authenticated account   |
 * | PATCH  | /users/me             | any authenticated account   |
 * | GET    | /users/me/favorites   | any authenticated account   |
 * | PUT    | /users/me/favorites/:storeId | any authenticated account |
 * | DELETE | /users/me/favorites/:storeId | any authenticated account |
 * | GET    | /users                | admin                       |
 * | GET    | /users/:id            | admin                       |
 * | PATCH  | /users/:id/role       | admin                       |
 * | PATCH  | /users/:id/status     | admin                       |
 * | DELETE | /users/:id            | admin                       |
 *
 * Sign-up itself stays in Firebase Auth on the client. This module owns the
 * profile document and the role that authorises every other endpoint.
 */

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { paginationSchema } from '../../lib/pagination';
import { authenticate, requireAuth, ROLES } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { sensitiveRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  createProfileSchema,
  removeAccountSchema,
  setAccountStatusSchema,
  setRoleSchema,
  updateProfileSchema,
  userIdParamSchema,
} from './user.model';
import * as service from './user.service';

export const userRouter = Router();

// Every route below requires a verified Firebase ID token.
userRouter.use(authenticate);

/** Complete a profile immediately after Firebase Auth sign-up. */
userRouter.post(
  '/me',
  sensitiveRateLimit,
  validate({ body: createProfileSchema }),
  asyncHandler(async (req, res) => {
    const profile = await service.createOwnProfile(requireAuth(req), req.body);
    res.status(201).json({ data: profile });
  }),
);

userRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const profile = await service.getProfile(requireAuth(req).uid);
    res.json({ data: profile });
  }),
);

userRouter.patch(
  '/me',
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    const profile = await service.updateOwnProfile(requireAuth(req), req.body);
    res.json({ data: profile });
  }),
);

/**
 * Favourite kitchens.
 *
 * `favorites` keeps the spelling the web app has written since before the API
 * existed - the path matches the field so the two never drift apart.
 *
 * PUT and DELETE rather than POST, because favouriting is idempotent: the
 * heart in an app can be tapped twice before the first answer lands, and
 * neither tap should be an error or leave a duplicate.
 */
const storeIdParamSchema = z.object({
  storeId: z.string().trim().min(1, 'Which kitchen?'),
});

userRouter.get(
  '/me/favorites',
  asyncHandler(async (req, res) => {
    const favourites = await service.listFavourites(requireAuth(req).uid);
    res.json({ data: favourites });
  }),
);

userRouter.put(
  '/me/favorites/:storeId',
  validate({ params: storeIdParamSchema }),
  asyncHandler(async (req, res) => {
    const favourites = await service.addFavourite(
      requireAuth(req).uid,
      req.params.storeId as string,
    );
    res.json({ data: favourites });
  }),
);

userRouter.delete(
  '/me/favorites/:storeId',
  validate({ params: storeIdParamSchema }),
  asyncHandler(async (req, res) => {
    const favourites = await service.removeFavourite(
      requireAuth(req).uid,
      req.params.storeId as string,
    );
    res.json({ data: favourites });
  }),
);

const listQuerySchema = paginationSchema.extend({
  role: z.enum(ROLES).optional(),
});

userRouter.get(
  '/',
  requireAdmin,
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit, cursor, role } = req.query as unknown as z.infer<
      typeof listQuerySchema
    >;
    const page = await service.listUsers({ limit, cursor, role });
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

userRouter.get(
  '/:id',
  requireAdmin,
  validate({ params: userIdParamSchema }),
  asyncHandler(async (req, res) => {
    const profile = await service.getUserAsAdmin(req.params.id as string);
    res.json({ data: profile });
  }),
);

/**
 * Suspend an account, or lift a suspension.
 *
 * Rate-limited with the other account controls: these lock real people out,
 * and a script running through the user list is not something to make easy.
 */
userRouter.patch(
  '/:id/status',
  requireAdmin,
  sensitiveRateLimit,
  validate({ params: userIdParamSchema, body: setAccountStatusSchema }),
  asyncHandler(async (req, res) => {
    const profile = await service.setAccountStatus(
      requireAuth(req),
      req.params.id as string,
      req.body,
    );
    res.json({ data: profile });
  }),
);

/** Remove an account from the platform. Their sign-in is deleted. */
userRouter.delete(
  '/:id',
  requireAdmin,
  sensitiveRateLimit,
  validate({ params: userIdParamSchema, body: removeAccountSchema }),
  asyncHandler(async (req, res) => {
    const profile = await service.removeAccount(
      requireAuth(req),
      req.params.id as string,
      req.body.reason,
    );
    res.json({ data: profile });
  }),
);

userRouter.patch(
  '/:id/role',
  requireAdmin,
  sensitiveRateLimit,
  validate({ params: userIdParamSchema, body: setRoleSchema }),
  asyncHandler(async (req, res) => {
    const profile = await service.assignRole(
      requireAuth(req),
      req.params.id as string,
      req.body.role,
    );
    res.json({
      data: profile,
      // The target's current ID token still carries the old claim until it is
      // refreshed; clients should force-refresh after a role change.
      meta: { tokenRefreshRequired: true },
    });
  }),
);
