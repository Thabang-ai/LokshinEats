/**
 * The kitchen's cash, while a driver is holding it.
 *
 * | Method | Path              | Access             |
 * |--------|-------------------|--------------------|
 * | GET    | /cash/outstanding | driver             |
 * | GET    | /cash/disputes    | admin              |
 * | POST   | /cash/disputes/:orderId | admin        |
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
import { requireAdmin, requireRole } from '../../middleware/requireRole';
import { sensitiveRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { z } from 'zod';
import * as cashService from './cash.service';

const orderParamSchema = z.object({
  orderId: z.string().trim().min(1).max(128),
});

/**
 * Upholding says the kitchen was right and the driver owes it again;
 * dismissing closes it in the driver's favour and moves the money.
 */
const resolveDisputeSchema = z
  .object({
    outcome: z.enum(['uphold', 'dismiss']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

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
 * Cash a kitchen says never arrived. Somebody has to decide these.
 */
cashRouter.get(
  '/disputes',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ data: await cashService.listDisputed() });
  }),
);

/** The decision: the kitchen was right, or the driver was. */
cashRouter.post(
  '/disputes/:orderId',
  authenticate,
  requireAdmin,
  sensitiveRateLimit,
  validate({ params: orderParamSchema, body: resolveDisputeSchema }),
  asyncHandler(async (req, res) => {
    const order = await cashService.resolveDispute(
      requireAuth(req),
      req.params.orderId as string,
      req.body.outcome,
      req.body.note?.trim() || null,
    );
    res.json({ data: order });
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
