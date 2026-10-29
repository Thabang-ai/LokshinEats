/**
 * Review routes.
 *
 * | Method | Path                        | Access                 |
 * |--------|-----------------------------|------------------------|
 * | POST   | /reviews/orders/:orderId    | the order's customer   |
 * | GET    | /reviews/orders/:orderId    | the order's customer   |
 * | GET    | /reviews/stores/:id         | public                 |
 * | GET    | /reviews/drivers/:id        | public                 |
 *
 * Reading is public because that is the whole point of a review; writing is
 * tied to an order the caller paid for and received.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { paginationSchema } from '../../lib/pagination';
import { authenticate, requireAuth } from '../../middleware/auth';
import { sensitiveRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { submitReviewSchema } from './review.model';
import * as service from './review.service';

export const reviewRouter = Router();

const orderParamSchema = z.object({
  orderId: z.string().trim().min(1).max(128),
});

const subjectParamSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

reviewRouter.post(
  '/orders/:orderId',
  authenticate,
  sensitiveRateLimit,
  validate({ params: orderParamSchema, body: submitReviewSchema }),
  asyncHandler(async (req, res) => {
    const reviews = await service.submit(
      requireAuth(req),
      req.params.orderId as string,
      req.body,
    );
    res.status(201).json({ data: reviews });
  }),
);

/** What this customer has already said, so the app asks once and not twice. */
reviewRouter.get(
  '/orders/:orderId',
  authenticate,
  validate({ params: orderParamSchema }),
  asyncHandler(async (req, res) => {
    const reviews = await service.forOrder(
      requireAuth(req),
      req.params.orderId as string,
    );
    res.json({ data: reviews });
  }),
);

/**
 * A kitchen's reviews and a driver's are the same list under two names.
 *
 * Two paths rather than one `/:subjectId`, so a client reads as what it means
 * and the pair can part company later without breaking either.
 */
const listReviews = asyncHandler(async (req: Request, res: Response) => {
  const { limit, cursor } = req.query as unknown as {
    limit: number;
    cursor?: string;
  };

  const page = await service.listFor(req.params.id as string, { limit, cursor });
  res.json({ data: page.items, nextCursor: page.nextCursor });
});

reviewRouter.get(
  '/stores/:id',
  validate({ params: subjectParamSchema, query: paginationSchema }),
  listReviews,
);

reviewRouter.get(
  '/drivers/:id',
  validate({ params: subjectParamSchema, query: paginationSchema }),
  listReviews,
);
