/**
 * Wallet routes.
 *
 * | Method | Path                          | Access | Purpose               |
 * |--------|-------------------------------|--------|-----------------------|
 * | GET    | /wallets/me                   | any    | Own balances          |
 * | GET    | /wallets/me/transactions      | any    | Own ledger            |
 * | GET    | /wallets/:id                  | admin  | Any wallet            |
 * | GET    | /wallets/:id/transactions     | admin  | Any ledger            |
 * | POST   | /wallets/:id/credit           | admin  | Refund, bonus, fix    |
 *
 * One wallet shape serves all three roles — a vendor's takings, a driver's
 * earnings, and a customer's refunds and credits are the same ledger with
 * different entry types. There is no endpoint that lets a user move their own
 * balance; every entry is written by settlement or by an admin.
 */

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate, requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { sensitiveRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  walletIdParamSchema,
  walletQuerySchema,
  type WalletQuery,
} from './wallet.model';
import * as service from './wallet.service';

export const walletRouter = Router();

walletRouter.use(authenticate);

walletRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getOwnWallet(requireAuth(req)) });
  }),
);

walletRouter.get(
  '/me/transactions',
  validate({ query: walletQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query as unknown as WalletQuery;
    const page = await service.listOwnTransactions(requireAuth(req), {
      limit,
      cursor,
    });
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

walletRouter.get(
  '/:id',
  requireAdmin,
  validate({ params: walletIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getWalletAsAdmin(req.params.id as string) });
  }),
);

walletRouter.get(
  '/:id/transactions',
  requireAdmin,
  validate({ params: walletIdParamSchema, query: walletQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query as unknown as WalletQuery;
    const page = await service.listTransactionsAsAdmin(req.params.id as string, {
      limit,
      cursor,
    });
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

const creditSchema = z
  .object({
    amount: z
      .number()
      .min(0.01, 'Credit at least one cent.')
      .max(100_000, 'That is larger than any single credit should be.')
      .multipleOf(0.01, 'Amount may not be finer than one cent.'),
    type: z.enum(['refund', 'bonus', 'adjustment']),
    description: z.string().trim().min(3).max(200),
    orderId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

/**
 * Manual credit — a goodwill refund, a promotional balance, a correction.
 *
 * Admin-only and always logged with the acting admin's uid. Paid from the
 * platform wallet as goodwill, so the platform's books show the expense
 * rather than money appearing from nowhere.
 */
walletRouter.post(
  '/:id/credit',
  requireAdmin,
  sensitiveRateLimit,
  validate({ params: walletIdParamSchema, body: creditSchema }),
  asyncHandler(async (req, res) => {
    const wallet = await service.manualCredit({
      actor: requireAuth(req),
      recipientId: req.params.id as string,
      amount: req.body.amount,
      description: req.body.description,
      orderId: req.body.orderId ?? null,
      type: req.body.type,
    });
    res.json({ data: wallet });
  }),
);
