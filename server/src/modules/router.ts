/**
 * Versioned API router.
 *
 * Every module mounts here under /api/v1. The version prefix matters more
 * than usual for this project: mobile apps stay installed on old versions for
 * months, so a breaking change ships as /api/v2 while v1 keeps serving.
 */

import { Router } from 'express';
import { notificationRouter } from './notifications/notification.routes';
import { orderRouter } from './orders/order.routes';
import { registerPaymentProviders } from './payments/payment.bootstrap';
import { cardPaymentsEnabled } from './payments/payment.provider';
import { paymentRouter } from './payments/payment.routes';
import { productRouter } from './products/product.routes';
import { storeRouter } from './stores/store.routes';
import { userRouter } from './users/user.routes';
import { walletRouter } from './wallets/wallet.routes';

// Registered before any route can be hit, so a provider that must not run in
// this environment stops the process at import rather than at a customer's
// first attempt to pay.
registerPaymentProviders();

export const apiRouter = Router();

/** Readiness probe, inside the version prefix for clients to check. */
apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: 'v1',
    time: new Date().toISOString(),
  });
});

/**
 * What this API can do right now, for the apps to shape themselves around.
 * Public: a signed-out customer browsing a menu needs to know what checkout
 * will accept before they fill a basket.
 */
apiRouter.get('/config', (_req, res) => {
  res.json({
    data: {
      paymentMethods: cardPaymentsEnabled()
        ? ['cash', 'yoco', 'ozow']
        : ['cash'],
    },
  });
});

apiRouter.use('/users', userRouter);
apiRouter.use('/stores', storeRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/wallets', walletRouter);
apiRouter.use('/notifications', notificationRouter);
