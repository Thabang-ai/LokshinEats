/**
 * Store routes.
 *
 * | Method | Path                | Access          |
 * |--------|---------------------|-----------------|
 * | GET    | /stores             | public          |
 * | GET    | /stores/mine        | vendor          |
 * | POST   | /stores             | authenticated   |
 * | PATCH  | /stores/mine        | vendor          |
 * | GET    | /stores/:id         | public          |
 * | PATCH  | /stores/:id         | admin           |
 *
 * Browsing is public because customers compare stores before signing in.
 * Every write resolves the caller's own store from their uid, so no route
 * accepts a store id that decides what gets written.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate, requireAuth } from '../../middleware/auth';
import { requireAdmin, requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import {
  createStoreSchema,
  listStoresQuerySchema,
  storeIdParamSchema,
  updateStoreSchema,
  type ListStoresQuery,
} from './store.model';
import * as service from './store.service';

export const storeRouter = Router();

storeRouter.get(
  '/',
  validate({ query: listStoresQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listStores(
      req.query as unknown as ListStoresQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

// Declared before /:id so "mine" is never read as a store id.
storeRouter.get(
  '/mine',
  authenticate,
  requireRole('vendor', 'admin'),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getOwnStore(requireAuth(req)) });
  }),
);

storeRouter.patch(
  '/mine',
  authenticate,
  requireRole('vendor', 'admin'),
  validate({ body: updateStoreSchema }),
  asyncHandler(async (req, res) => {
    const store = await service.updateOwnStore(requireAuth(req), req.body);
    res.json({ data: store });
  }),
);

/**
 * Any authenticated account may register a store — that is what promotes it
 * to the vendor role, so requiring the role first would be circular.
 */
storeRouter.post(
  '/',
  authenticate,
  validate({ body: createStoreSchema }),
  asyncHandler(async (req, res) => {
    const store = await service.createStore(requireAuth(req), req.body);
    res.status(201).json({
      data: store,
      // The caller was just promoted to vendor; their current ID token still
      // carries the old claim until it is refreshed.
      meta: { tokenRefreshRequired: true },
    });
  }),
);

storeRouter.get(
  '/:id',
  validate({ params: storeIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getStore(req.params.id as string) });
  }),
);

storeRouter.patch(
  '/:id',
  authenticate,
  requireAdmin,
  validate({ params: storeIdParamSchema, body: updateStoreSchema }),
  asyncHandler(async (req, res) => {
    const store = await service.updateStoreAsAdmin(
      requireAuth(req),
      req.params.id as string,
      req.body,
    );
    res.json({ data: store });
  }),
);
