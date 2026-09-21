/**
 * Payment provider registration.
 *
 * Imported once at startup. Registering here rather than at each call site
 * means the set of usable providers is decided in one place, and a provider
 * that must not run in the current environment fails at boot rather than on
 * a customer's first attempt to pay.
 */

import { env, isProduction } from '../../config/env';
import { moduleLogger } from '../../config/logger';
import { registerProvider, listProviders } from './payment.provider';
import { SandboxPaymentProvider } from './providers/sandbox.provider';

const log = moduleLogger('payments:bootstrap');

export function registerPaymentProviders(): void {
  // Cash only: no provider, by design. Card and EFT orders are refused where
  // orders are placed, and /api/v1/config tells the apps not to offer them.
  if (env.PAYMENT_PROVIDER === 'none') {
    log.info('Card payments are off: this API takes cash orders only.');
    return;
  }

  // The sandbox provider's own constructor refuses to build in production
  // unless explicitly allowed, so this both registers it and enforces that.
  if (env.PAYMENT_PROVIDER === 'sandbox' || !isProduction) {
    registerProvider(new SandboxPaymentProvider());
  }

  // A live provider (Paystack, PayShap) registers here as one more adapter.
  // Nothing above this line changes when one is added.

  const available = listProviders();

  if (available.length === 0) {
    throw new Error(
      `No payment provider is registered. PAYMENT_PROVIDER is ` +
        `"${env.PAYMENT_PROVIDER}", which is not implemented yet.`,
    );
  }

  if (!available.some((provider) => provider.name === env.PAYMENT_PROVIDER)) {
    throw new Error(
      `PAYMENT_PROVIDER is "${env.PAYMENT_PROVIDER}" but only ` +
        `[${available.map((p) => p.name).join(', ')}] are registered.`,
    );
  }

  log.info(
    {
      configured: env.PAYMENT_PROVIDER,
      registered: available.map((provider) => provider.name),
      live: available.some((provider) => provider.isLive),
    },
    'Payment providers registered.',
  );
}
