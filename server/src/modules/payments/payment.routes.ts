/**
 * Payment routes.
 *
 * | Method | Path                                   | Access   |
 * |--------|----------------------------------------|----------|
 * | POST   | /payments                              | customer |
 * | POST   | /payments/:id/verify                   | customer |
 * | GET    | /payments/mine                         | customer |
 * | GET    | /payments/:id                          | customer |
 * | GET    | /payments                              | admin    |
 * | POST   | /payments/:id/refund                   | admin    |
 * | POST   | /payments/sandbox/:reference/complete  | sandbox  |
 *
 * Everything money-related sits on the tighter rate-limit bucket.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { ApiError } from '../../lib/ApiError';
import { authenticate, requireAuth } from '../../middleware/auth';
import { requireAdmin, requireRole } from '../../middleware/requireRole';
import { sensitiveRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  initiatePaymentSchema,
  listPaymentsQuerySchema,
  paymentIdParamSchema,
  refundSchema,
  sandboxCompleteSchema,
  sandboxReferenceParamSchema,
  type ListPaymentsQuery,
} from './payment.model';
import { getProvider } from './payment.provider';
import { SandboxPaymentProvider } from './providers/sandbox.provider';
import * as service from './payment.service';

export const paymentRouter = Router();

paymentRouter.use(authenticate);

paymentRouter.post(
  '/',
  requireRole('customer', 'admin'),
  sensitiveRateLimit,
  validate({ body: initiatePaymentSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.initiatePayment(requireAuth(req), req.body);
    res.status(201).json({
      data: result.payment,
      meta: {
        redirectUrl: result.redirectUrl,
        clientPayload: result.clientPayload,
      },
    });
  }),
);

paymentRouter.get(
  '/mine',
  validate({ query: listPaymentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listOwnPayments(
      requireAuth(req),
      req.query as unknown as ListPaymentsQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

paymentRouter.get(
  '/',
  requireAdmin,
  validate({ query: listPaymentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listAllPayments(
      req.query as unknown as ListPaymentsQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

/**
 * Resolve a sandbox charge.
 *
 * Stands in for the customer completing payment on a provider's page. It only
 * exists while the sandbox provider is the one configured; against a live
 * provider this route reports 404, because only the provider may decide the
 * outcome of a real charge.
 */
paymentRouter.post(
  '/sandbox/:reference/complete',
  sensitiveRateLimit,
  validate({
    params: sandboxReferenceParamSchema,
    body: sandboxCompleteSchema,
  }),
  asyncHandler(async (req, res) => {
    let provider;
    try {
      provider = getProvider('sandbox');
    } catch {
      throw ApiError.notFound('Sandbox payments are not enabled.');
    }

    if (!(provider instanceof SandboxPaymentProvider)) {
      throw ApiError.notFound('Sandbox payments are not enabled.');
    }

    await provider.complete(
      req.params.reference as string,
      req.body.outcome,
      req.body.reason,
    );

    res.json({ data: { reference: req.params.reference, outcome: req.body.outcome } });
  }),
);

paymentRouter.get(
  '/:id',
  validate({ params: paymentIdParamSchema }),
  asyncHandler(async (req, res) => {
    const payment = await service.getPayment(
      requireAuth(req),
      req.params.id as string,
    );
    res.json({ data: payment });
  }),
);

/**
 * Ask the provider what happened and settle if it succeeded.
 *
 * Idempotent, so a client may poll this after returning from a redirect.
 */
paymentRouter.post(
  '/:id/verify',
  sensitiveRateLimit,
  validate({ params: paymentIdParamSchema }),
  asyncHandler(async (req, res) => {
    const payment = await service.verifyPayment(
      requireAuth(req),
      req.params.id as string,
    );
    res.json({ data: payment });
  }),
);

paymentRouter.post(
  '/:id/refund',
  requireAdmin,
  sensitiveRateLimit,
  validate({ params: paymentIdParamSchema, body: refundSchema }),
  asyncHandler(async (req, res) => {
    const payment = await service.refundPayment(
      requireAuth(req),
      req.params.id as string,
      req.body.reason,
    );
    res.json({ data: payment });
  }),
);
