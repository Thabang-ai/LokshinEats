/**
 * Sandbox payment provider.
 *
 * Stands in for a real gateway so the whole payment path — initiate, verify,
 * settle, credit wallets, reconcile — can be built and tested without waiting
 * on merchant-account approval. A real provider is a second implementation of
 * `PaymentProvider`, not a rewrite of anything above it.
 *
 * This is deliberately NOT the old `services/paymentService.ts`, which
 * resolved every payment as successful after a `setTimeout` and returned an
 * invented transaction id. Two differences matter:
 *
 *   1. Success is never automatic. `initiate` creates a charge that is
 *      `pending`, and it stays pending until something explicitly completes
 *      it — the same shape as a customer returning from a real redirect. Code
 *      written against this provider therefore cannot accidentally depend on
 *      payments always succeeding.
 *   2. It cannot run in production. The constructor refuses to build unless
 *      the environment allows it, so a misconfigured deploy fails at boot
 *      rather than quietly accepting fake money.
 *
 * Intents live in Firestore rather than in memory so that behaviour is
 * consistent across restarts and across more than one server instance.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../../config/firebase';
import { env, isProduction } from '../../../config/env';
import { moduleLogger } from '../../../config/logger';
import { ApiError } from '../../../lib/ApiError';
import type {
  InitiateInput,
  PaymentIntent,
  PaymentProvider,
  VerificationResult,
} from '../payment.provider';

const log = moduleLogger('payments:sandbox');

/** Sandbox charges live in their own collection, never mixed with real ones. */
const COLLECTION = 'sandboxPayments';

export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';

  /** Never live. Consulted before this provider may be selected. */
  readonly isLive = false;

  constructor() {
    if (isProduction && !env.ALLOW_SANDBOX_PAYMENTS) {
      // Failing at boot is the point: a production deploy that would have
      // accepted simulated payments never starts serving.
      throw new Error(
        'The sandbox payment provider cannot run in production. Configure a ' +
          'live provider, or set ALLOW_SANDBOX_PAYMENTS=true if this is a ' +
          'staging environment that only looks like production.',
      );
    }

    if (isProduction) {
      log.warn(
        'Sandbox payments are enabled in a production environment. No real ' +
          'money will move.',
      );
    }
  }

  async initiate(input: InitiateInput): Promise<PaymentIntent> {
    // Mirrors the shape of a real provider reference so nothing downstream
    // learns to depend on the format.
    const reference = `sbx_${input.orderId}_${Date.now().toString(36)}`;

    await db.collection(COLLECTION).doc(reference).set({
      orderId: input.orderId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    log.info(
      { reference, orderId: input.orderId, amountCents: input.amountCents },
      'Sandbox charge created.',
    );

    return {
      reference,
      // Where a real provider would host its checkout page. The client is
      // expected to drive the completion endpoint instead.
      redirectUrl: null,
      clientPayload: {
        provider: 'sandbox',
        reference,
        // Stated explicitly so a UI built against this cannot present it as a
        // real payment screen by accident.
        simulated: true,
        completeEndpoint: `/api/v1/payments/sandbox/${reference}/complete`,
      },
    };
  }

  async verify(reference: string): Promise<VerificationResult> {
    const snapshot = await db.collection(COLLECTION).doc(reference).get();

    if (!snapshot.exists) {
      return { status: 'failed', reason: 'Unknown payment reference.' };
    }

    const data = snapshot.data() ?? {};

    if (data.status === 'succeeded') {
      return {
        status: 'succeeded',
        // Reported from the stored charge, not from the caller, so a
        // mismatched amount is still detectable upstream.
        amountCents: Number(data.amountCents ?? 0),
        currency: String(data.currency ?? 'ZAR'),
        transactionId: `sbxtxn_${reference}`,
      };
    }

    if (data.status === 'failed') {
      return {
        status: 'failed',
        reason: String(data.reason ?? 'Payment was declined.'),
      };
    }

    return { status: 'pending' };
  }

  /**
   * Complete a sandbox charge.
   *
   * Stands in for the customer finishing the flow on the provider's page.
   * Exposed through a sandbox-only route; there is no equivalent on a live
   * provider, where only the provider itself can decide this.
   */
  async complete(
    reference: string,
    outcome: 'succeed' | 'fail',
    reason?: string,
  ): Promise<void> {
    const ref = db.collection(COLLECTION).doc(reference);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw ApiError.notFound('Unknown sandbox payment reference.');
    }
    if (snapshot.get('status') !== 'pending') {
      throw ApiError.conflict('This sandbox payment is already resolved.');
    }

    await ref.update({
      status: outcome === 'succeed' ? 'succeeded' : 'failed',
      reason: outcome === 'fail' ? (reason ?? 'Simulated decline.') : null,
      resolvedAt: FieldValue.serverTimestamp(),
    });

    log.info({ reference, outcome }, 'Sandbox charge resolved.');
  }
}
