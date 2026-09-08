/**
 * Payment domain model.
 *
 * A payment record is the audit trail for one attempt to charge for one
 * order. It is written before the customer is sent to the provider and
 * updated only from the provider's own answer, so a charge that succeeded at
 * the bank but failed to reach us is still visible and reconcilable.
 *
 * Note what a client may send: an order id and, at most, a provider name.
 * Not an amount. The amount comes from the order, which the server priced.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { toIso, toNumber, toStringOr } from '../../lib/serialize';

export const PAYMENT_RECORD_STATUSES = [
  'initiated',
  'succeeded',
  'failed',
  'refunded',
] as const;

export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUSES)[number];

export type Payment = {
  id: string;
  orderId: string;
  customerId: string;
  /** Amount in rands, taken from the order at initiation. */
  amount: number;
  currency: 'ZAR';
  provider: string;
  providerReference: string | null;
  transactionId: string | null;
  status: PaymentRecordStatus;
  failureReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export const initiatePaymentSchema = z
  .object({
    orderId: z.string().trim().min(1).max(128),
    // Optional override, mainly for testing against a specific adapter. The
    // configured default is used when absent, and a provider that is not
    // registered is rejected.
    provider: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

export const paymentIdParamSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const listPaymentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(200).optional(),
  status: z.enum(PAYMENT_RECORD_STATUSES).optional(),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

/** Sandbox-only: resolve a simulated charge. */
export const sandboxCompleteSchema = z
  .object({
    outcome: z.enum(['succeed', 'fail']),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export const sandboxReferenceParamSchema = z.object({
  reference: z.string().trim().min(1).max(200),
});

export const refundSchema = z
  .object({
    reason: z.string().trim().min(3).max(200),
  })
  .strict();

/** Firestore document to API representation. */
export function toPayment(snapshot: DocumentSnapshot): Payment {
  const data = snapshot.data() ?? {};

  const status = PAYMENT_RECORD_STATUSES.includes(
    data.status as PaymentRecordStatus,
  )
    ? (data.status as PaymentRecordStatus)
    : 'initiated';

  return {
    id: snapshot.id,
    orderId: toStringOr(data.orderId),
    customerId: toStringOr(data.customerId),
    amount: toNumber(data.amount),
    currency: 'ZAR',
    provider: toStringOr(data.provider),
    providerReference:
      typeof data.providerReference === 'string'
        ? data.providerReference
        : null,
    transactionId:
      typeof data.transactionId === 'string' ? data.transactionId : null,
    status,
    failureReason:
      typeof data.failureReason === 'string' ? data.failureReason : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
