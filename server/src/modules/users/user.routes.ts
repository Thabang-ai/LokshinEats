/**
 * User routes.
 *
 * | Method | Path                  | Access                      |
 * |--------|-----------------------|-----------------------------|
 * | POST   | /users/me             | any authenticated account   |
 * | GET    | /users/me             | any authenticated account   |
 * | PATCH  | /users/me             | any authenticated account   |
 * | GET    | /users                | admin                       |
 * | GET    | /users/:id            | admin                       |
 * | PATCH  | /users/:id/role       | admin                       |
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
