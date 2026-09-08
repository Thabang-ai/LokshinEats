/**
 * Payment schema and provider-registry tests.
 *
 * The property being guarded is that a client cannot influence what it is
 * charged, and cannot declare its own payment successful.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  initiatePaymentSchema,
  refundSchema,
  sandboxCompleteSchema,
  toPayment,
} from './payment.model';
import {
  getProvider,
  listProviders,
  registerProvider,
  resetProviders,
  UnknownProviderError,
  type PaymentProvider,
} from './payment.provider';

describe('initiatePaymentSchema', () => {
  it('accepts just an order id', () => {
    const parsed = initiatePaymentSchema.parse({ orderId: 'order-1' });
    expect(parsed.orderId).toBe('order-1');
    expect(parsed.provider).toBeUndefined();
  });

  it('refuses to let a client name the amount it will be charged', () => {
    // The amount comes from the order, which the server priced. Accepting it
    // here would let a customer pay R1 for a R500 basket.
    for (const field of ['amount', 'amountCents', 'total', 'currency']) {
      expect(() =>
        initiatePaymentSchema.parse({ orderId: 'order-1', [field]: 1 }),
      ).toThrow();
    }
  });

  it('refuses to let a client declare the payment already successful', () => {
    expect(() =>
      initiatePaymentSchema.parse({ orderId: 'order-1', status: 'succeeded' }),
    ).toThrow();
    expect(() =>
      initiatePaymentSchema.parse({
        orderId: 'order-1',
        transactionId: 'made-up',
      }),
    ).toThrow();
  });
});

describe('sandboxCompleteSchema', () => {
  it('accepts only the two real outcomes', () => {
    expect(sandboxCompleteSchema.parse({ outcome: 'succeed' }).outcome).toBe(
      'succeed',
    );
    expect(sandboxCompleteSchema.parse({ outcome: 'fail' }).outcome).toBe('fail');
    expect(() => sandboxCompleteSchema.parse({ outcome: 'maybe' })).toThrow();
  });
});

describe('refundSchema', () => {
  it('requires a stated reason', () => {
    // A refund with no reason is unauditable.
    expect(() => refundSchema.parse({})).toThrow();
    expect(() => refundSchema.parse({ reason: 'x' })).toThrow();
    expect(refundSchema.parse({ reason: 'Order never arrived' }).reason).toBe(
      'Order never arrived',
    );
  });
});

describe('toPayment', () => {
  it('falls back to a safe status rather than trusting stored junk', () => {
    const payment = toPayment({
      id: 'pay-1',
      data: () => ({ status: 'definitely-paid' }),
    } as never);

    expect(payment.status).toBe('initiated');
  });

  it('never emits NaN for a missing amount', () => {
    const payment = toPayment({ id: 'pay-2', data: () => ({}) } as never);
    expect(payment.amount).toBe(0);
    expect(Number.isNaN(payment.amount)).toBe(false);
  });
});

/** Minimal provider used to exercise the registry. */
function stubProvider(name: string, isLive = false): PaymentProvider {
  return {
    name,
    isLive,
    async initiate() {
      return { reference: 'ref', redirectUrl: null, clientPayload: null };
    },
    async verify() {
      return { status: 'pending' as const };
    },
  };
}

describe('provider registry', () => {
  afterEach(() => {
    resetProviders();
  });

  it('returns a registered provider by name', () => {
    const provider = stubProvider('stub');
    registerProvider(provider);
    expect(getProvider('stub')).toBe(provider);
  });

  it('refuses an unknown provider rather than falling back to any', () => {
    // Silently substituting a different provider would mean charging through
    // a gateway nobody chose.
    registerProvider(stubProvider('stub'));
    expect(() => getProvider('paystack')).toThrow(UnknownProviderError);
  });

  it('reports whether any registered provider handles real money', () => {
    registerProvider(stubProvider('sandbox', false));
    expect(listProviders().some((provider) => provider.isLive)).toBe(false);

    registerProvider(stubProvider('live-one', true));
    expect(listProviders().some((provider) => provider.isLive)).toBe(true);
  });
});
