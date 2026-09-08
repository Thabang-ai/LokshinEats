/**
 * Versioned API router.
 *
 * Every module mounts here under /api/v1. The version prefix matters more
 * than usual for this project: mobile apps stay installed on old versions for
 * months, so a breaking change ships as /api/v2 while v1 keeps serving.
 */

import { Router } from 'express';
import { orderRouter } from './orders/order.routes';
import { productRouter } from './products/product.routes';
import { storeRouter } from './stores/store.routes';
import { userRouter } from './users/user.routes';

export const apiRouter = Router();

/** Readiness probe, inside the version prefix for clients to check. */
apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: 'v1',
    time: new Date().toISOString(),
  });
});

apiRouter.use('/users', userRouter);
apiRouter.use('/stores', storeRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/orders', orderRouter);
