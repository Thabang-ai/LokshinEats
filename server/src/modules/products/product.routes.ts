/**
 * Product routes.
 *
 * | Method | Path             | Access        |
 * |--------|------------------|---------------|
 * | GET    | /products        | public        |
 * | GET    | /products/mine   | vendor        |
 * | POST   | /products        | vendor        |
 * | GET    | /products/:id    | public        |
 * | PATCH  | /products/:id    | vendor (own)  |
 * | DELETE | /products/:id    | vendor (own)  |
 *
 * Menus are public so customers can browse before signing in. Writes never
 * take a store id from the request — it comes from the caller's own store.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate, requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  updateProductSchema,
  type ListProductsQuery,
} from './product.model';
import * as service from './product.service';

export const productRouter = Router();

productRouter.get(
  '/',
  validate({ query: listProductsQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listProducts(
      req.query as unknown as ListProductsQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

// Before /:id so "mine" is not read as a product id.
productRouter.get(
  '/mine',
  authenticate,
  requireRole('vendor', 'admin'),
  validate({ query: listProductsQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await service.listOwnProducts(
      requireAuth(req),
      req.query as unknown as ListProductsQuery,
    );
    res.json({ data: page.items, nextCursor: page.nextCursor });
  }),
);

productRouter.post(
  '/',
  authenticate,
  requireRole('vendor', 'admin'),
  validate({ body: createProductSchema }),
  asyncHandler(async (req, res) => {
    const product = await service.createProduct(requireAuth(req), req.body);
    res.status(201).json({ data: product });
  }),
);

productRouter.get(
  '/:id',
  validate({ params: productIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getProduct(req.params.id as string) });
  }),
);

productRouter.patch(
  '/:id',
  authenticate,
  requireRole('vendor', 'admin'),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  asyncHandler(async (req, res) => {
    const product = await service.updateProduct(
      requireAuth(req),
      req.params.id as string,
      req.body,
    );
    res.json({ data: product });
  }),
);

productRouter.delete(
  '/:id',
  authenticate,
  requireRole('vendor', 'admin'),
  validate({ params: productIdParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteProduct(requireAuth(req), req.params.id as string);
    // 204: the client already knows the id it deleted.
    res.status(204).send();
  }),
);
