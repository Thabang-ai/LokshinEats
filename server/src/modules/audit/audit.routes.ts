/**
 * The audit log.
 *
 * | Method | Path    | Access |
 * |--------|---------|--------|
 * | GET    | /audit  | admin  |
 *
 * Read-only, and admin only. There is no endpoint that writes one of these
 * by hand and none that edits or deletes one: entries are written by the
 * actions themselves, and a log somebody can edit is evidence of nothing.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { listAuditQuerySchema, type ListAuditQuery } from './audit.model';
import * as service from './audit.service';

export const auditRouter = Router();

auditRouter.get(
  '/',
  authenticate,
  requireAdmin,
  validate({ query: listAuditQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.list(req.query as unknown as ListAuditQuery);
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);
