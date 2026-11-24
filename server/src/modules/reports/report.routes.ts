/**
 * Operator reports.
 *
 * | Method | Path                        | Access |
 * |--------|-----------------------------|--------|
 * | GET    | /reports/reconciliation/:date | admin |
 *
 * Admin only, and read-only: these answer questions about money that has
 * already moved, and must never be able to move any of it.
 */

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate, requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { moduleLogger } from '../../config/logger';
import * as reconciliation from './reconciliation.service';

const log = moduleLogger('reports');

export const reportRouter = Router();

const dayParamSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
});

reportRouter.get(
  '/reconciliation/:date',
  authenticate,
  requireAdmin,
  validate({ params: dayParamSchema }),
  asyncHandler(async (req, res) => {
    const date = req.params.date as string;
    const report = await reconciliation.reconcileDay(date);

    // Who looked, and at what. A reconciliation is the report somebody reads
    // before an awkward conversation; it should be visible that they read it.
    log.info({ admin: requireAuth(req).uid, date }, 'Reconciliation read.');

    res.json({ data: report });
  }),
);
