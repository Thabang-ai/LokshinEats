/**
 * The kitchen's cash, while a driver is holding it.
 *
 * | Method | Path              | Access             |
 * |--------|-------------------|--------------------|
 * | GET    | /cash/outstanding | driver             |
 * | POST   | /cash/sweep       | admin, or schedule |
 * | GET    | /cash/sweep       | the schedule, which only sends GET |
 *
 * Its own router rather than part of /orders, because the sweep is the one
 * route here that no person signs in for: the order router authenticates
 * everything it serves, and a scheduler has no account.
 */

import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { allowCronOrAdmin } from '../../middleware/allowCronOrAdmin';
import { authenticate, requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import * as cashService from './cash.service';

export const cashRouter = Router();

/** What this driver still owes kitchens, and by when. Their own, only. */
cashRouter.get(
  '/outstanding',
  authenticate,
  requireRole('driver', 'admin'),
  asyncHandler(async (req, res) => {
    const outstanding = await cashService.outstandingFor(requireAuth(req).uid);

    res.json({
      data: {
        total: outstanding.total,
        overdueTotal: outstanding.overdueTotal,
        nextDueAt: outstanding.nextDueAt,
        orderIds: outstanding.orders.map((order) => order.id),
        overdueOrderIds: outstanding.overdue.map((order) => order.id),
      },
    });
  }),
);

/**
 * Suspend every driver whose deadline has passed.
 *
 * Safe to repeat as often as it likes: a driver already suspended is left
 * alone, and one who owes nothing is never touched.
 */
const sweep = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await cashService.sweepOverdue() });
});

cashRouter.post('/sweep', allowCronOrAdmin, sweep);

// Vercel's scheduler only ever sends GET, and it is the scheduler this exists
// for. Running it is idempotent, so answering a GET costs nothing.
cashRouter.get('/sweep', allowCronOrAdmin, sweep);
