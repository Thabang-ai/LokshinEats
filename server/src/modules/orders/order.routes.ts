/**
 * Order routes.
 *
 * | Method | Path                    | Access              |
 * |--------|-------------------------|---------------------|
 * | POST   | /orders                 | customer            |
 * | GET    | /orders/mine            | customer            |
 * | GET    | /orders/store           | vendor              |
 * | GET    | /orders/assigned        | driver              |
 * | GET    | /orders/available       | driver              |
 * | GET    | /orders                 | admin               |
 * | GET    | /orders/:id             | party to the order  |
 * | PATCH  | /orders/:id/status      | party to the order  |
 * | POST   | /orders/:id/accept      | driver              |
 * | POST   | /orders/:id/release     | assigned driver     |
 * | POST   | /orders/:id/complete    | assigned driver     |
 * | POST   | /orders/:id/cash-handover | assigned driver   |
 * | POST   | /orders/:id/cash-receipt  | owning vendor     |
 *
 * Collection routes come before /:id so none of their names is read as an
 * order id.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate, requireAuth } from '../../middleware/auth';
import { requireAdmin, requireRole } from '../../middleware/requireRole';
import { sensitiveRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  cashReceiptSchema,
  completeDeliverySchema,
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  updateStatusSchema,
  type ListOrdersQuery,
} from './order.model';
import * as service from './order.service';

export const orderRouter = Router();

// There is no anonymous ordering: every route needs a verified identity.
orderRouter.use(authenticate);

/**
 * Place an order.
 *
 * Rate-limited on the sensitive bucket — this is the endpoint that creates
 * money-bearing records.
 */
orderRouter.post(
  '/',
  requireRole('customer', 'admin'),
  sensitiveRateLimit,
  validate({ body: createOrderSchema }),
  asyncHandler(async (req, res) => {
    const order = await service.placeOrder(requireAuth(req), req.body);
    res.status(201).json({ data: order });
  }),
);

orderRouter.get(
  '/mine',
  validate({ query: listOrdersQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listOwnOrders(
      requireAuth(req),
      req.query as unknown as ListOrdersQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

orderRouter.get(
  '/store',
  requireRole('vendor', 'admin'),
  validate({ query: listOrdersQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listStoreOrders(
      requireAuth(req),
      req.query as unknown as ListOrdersQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

orderRouter.get(
  '/assigned',
  requireRole('driver', 'admin'),
  validate({ query: listOrdersQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listDriverOrders(
      requireAuth(req),
      req.query as unknown as ListOrdersQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

orderRouter.get(
  '/available',
  requireRole('driver', 'admin'),
  validate({ query: listOrdersQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listAvailableOrders(
      req.query as unknown as ListOrdersQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

orderRouter.get(
  '/',
  requireAdmin,
  validate({ query: listOrdersQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listAllOrders(
      req.query as unknown as ListOrdersQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

orderRouter.get(
  '/:id',
  validate({ params: orderIdParamSchema }),
  asyncHandler(async (req, res) => {
    const order = await service.getOrder(
      requireAuth(req),
      req.params.id as string,
    );
    res.json({ data: order });
  }),
);

orderRouter.patch(
  '/:id/status',
  validate({ params: orderIdParamSchema, body: updateStatusSchema }),
  asyncHandler(async (req, res) => {
    const order = await service.changeStatus(
      requireAuth(req),
      req.params.id as string,
      req.body.status,
    );
    res.json({ data: order });
  }),
);

orderRouter.post(
  '/:id/accept',
  requireRole('driver', 'admin'),
  validate({ params: orderIdParamSchema }),
  asyncHandler(async (req, res) => {
    const order = await service.acceptOrder(
      requireAuth(req),
      req.params.id as string,
    );
    res.json({ data: order });
  }),
);

/** Give up a claim before collecting, returning it to the available pool. */
orderRouter.post(
  '/:id/release',
  requireRole('driver', 'admin'),
  validate({ params: orderIdParamSchema }),
  asyncHandler(async (req, res) => {
    const order = await service.releaseOrder(
      requireAuth(req),
      req.params.id as string,
    );
    res.json({ data: order });
  }),
);

/**
 * Record that the driver handed the vendor their cash.
 *
 * No amount in the body: it is computed from the order, because it is what
 * the driver owes.
 */
orderRouter.post(
  '/:id/cash-handover',
  requireRole('driver', 'admin'),
  sensitiveRateLimit,
  validate({ params: orderIdParamSchema }),
  asyncHandler(async (req, res) => {
    const order = await service.recordCashHandover(
      requireAuth(req),
      req.params.id as string,
    );
    res.json({ data: order });
  }),
);

/** The vendor confirms or disputes that handover. */
orderRouter.post(
  '/:id/cash-receipt',
  requireRole('vendor', 'admin'),
  sensitiveRateLimit,
  validate({ params: orderIdParamSchema, body: cashReceiptSchema }),
  asyncHandler(async (req, res) => {
    const order = await service.settleCashReceipt(
      requireAuth(req),
      req.params.id as string,
      req.body.outcome,
    );
    res.json({ data: order });
  }),
);

/**
 * Confirm delivery with the customer's code.
 *
 * A wrong code returns 422 with the number of attempts left rather than a
 * generic failure, so a driver who mistypes knows to try again — while the
 * counter still closes the order off after a handful of guesses.
 */
orderRouter.post(
  '/:id/complete',
  requireRole('driver', 'admin'),
  sensitiveRateLimit,
  validate({ params: orderIdParamSchema, body: completeDeliverySchema }),
  asyncHandler(async (req, res) => {
    const result = await service.confirmDelivery(
      requireAuth(req),
      req.params.id as string,
      req.body.code,
    );

    if (result.outcome === 'wrong_code') {
      res.status(422).json({
        error: {
          code: 'unprocessable',
          message: 'That delivery code is not correct.',
          details: { attemptsRemaining: result.attemptsRemaining },
        },
      });
      return;
    }

    res.json({ data: result.order });
  }),
);
