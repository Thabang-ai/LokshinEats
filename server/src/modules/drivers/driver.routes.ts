/**
 * Driver verification routes.
 *
 * | Method | Path                        | Access            |
 * |--------|-----------------------------|-------------------|
 * | GET    | /drivers/me                 | signed in         |
 * | POST   | /drivers/me                 | signed in         |
 * | GET    | /drivers                    | admin             |
 * | PATCH  | /drivers/:id/verification   | admin             |
 *
 * Every route that writes resolves the driver from the caller's own uid,
 * except the admin decision, which is the only place one account decides
 * anything about another.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate, requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { sensitiveRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  decideDriverSchema,
  driverIdParamSchema,
  listDriversQuerySchema,
  submitDriverDetailsSchema,
  type VerificationStatus,
} from './driver.model';
import * as service from './driver.service';

export const driverRouter = Router();

driverRouter.use(authenticate);

/** Your own application, or null if you have not made one. */
driverRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const profile = await service.getOwn(requireAuth(req).uid);
    res.json({ data: profile });
  }),
);

/** Submit, or resubmit, your details. Resubmitting returns you to the queue. */
driverRouter.post(
  '/me',
  sensitiveRateLimit,
  validate({ body: submitDriverDetailsSchema }),
  asyncHandler(async (req, res) => {
    const profile = await service.submitOwnDetails(requireAuth(req), req.body);
    res.status(201).json({ data: profile });
  }),
);

driverRouter.get(
  '/',
  requireAdmin,
  validate({ query: listDriversQuerySchema }),
  asyncHandler(async (req, res) => {
    const { status } = req.query as { status?: VerificationStatus };
    const drivers = await service.listForReview({ status });
    res.json({ data: drivers });
  }),
);

driverRouter.patch(
  '/:id/verification',
  requireAdmin,
  validate({ params: driverIdParamSchema, body: decideDriverSchema }),
  asyncHandler(async (req, res) => {
    const profile = await service.decide(
      requireAuth(req),
      req.params.id as string,
      req.body,
    );
    res.json({ data: profile });
  }),
);
