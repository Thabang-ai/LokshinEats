/**
 * Payment provider abstraction.
 *
 * Providers differ in almost everything — redirect flows versus inline
 * widgets, webhooks versus polling, minor units versus major — so the
 * interface is kept deliberately small and states the two things the
 * settlement logic actually needs:
 *
 *   `initiate` — start a charge, and tell the client how to complete it.
 *   `verify`   — ask the provider, server to server, what really happened.
 *
 * The second is the important one. The old web app decided a payment had
 * succeeded because its own simulated function said so. Nothing a client
 * sends can mark an order paid here: only the answer to `verify`, which the
 * server asks the provider directly, can.
 *
 * Verify returns the amount the provider actually captured, in cents. The
 * caller compares it against the order total, so a charge for the wrong
 * amount cannot settle an order as paid.
 */

export type PaymentIntent = {
  /** The provider's own reference, stored so `verify` can find the charge. */
  reference: string;
  /** Where to send the customer, when the provider uses a redirect flow. */
  redirectUrl: string | null;
  /** Anything the client SDK needs, passed through untouched. */
  clientPayload: Record<string, unknown> | null;
};

export type VerificationResult =
  | {
      status: 'succeeded';
      /** Amount actually captured, in cents. */
      amountCents: number;
      currency: string;
      /** The provider's transaction id, for reconciliation. */
      transactionId: string;
    }
  | { status: 'pending' }
  | { status: 'failed'; reason: string };

export type InitiateInput = {
  orderId: string;
  /** Amount to charge, in cents. Never a float. */
  amountCents: number;
  currency: 'ZAR';
  customerEmail: string | null;
  customerPhone: string;
  /** Where the provider should return the customer afterwards. */
  returnUrl: string | null;
};

export interface PaymentProvider {
  /** Stable key stored on the payment record, e.g. "sandbox", "paystack". */
  readonly name: string;

  /**
   * True when this provider can be used for real money. A provider that
   * cannot must never be selectable in production.
   */
  readonly isLive: boolean;

  initiate(input: InitiateInput): Promise<PaymentIntent>;

  verify(reference: string): Promise<VerificationResult>;
}

/** Thrown when a provider is asked for that is not registered or not usable. */
export class UnknownProviderError extends Error {
  constructor(name: string) {
    super(`No payment provider named "${name}" is available.`);
    this.name = 'UnknownProviderError';
  }
}

const registry = new Map<string, PaymentProvider>();

export function registerProvider(provider: PaymentProvider): void {
  registry.set(provider.name, provider);
}

export function getProvider(name: string): PaymentProvider {
  const provider = registry.get(name);
  if (!provider) throw new UnknownProviderError(name);
  return provider;
}

export function listProviders(): PaymentProvider[] {
  return [...registry.values()];
}

/** Test seam: clears the registry between suites. */
export function resetProviders(): void {
  registry.clear();
}
