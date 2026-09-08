'use client';

// Orders and payments, via the API.
//
// Replaces the old flow, where the browser priced the order, ran a simulated
// payment, invented a delivery code, and wrote the whole document to Firestore
// itself. The request below carries no prices at all: just what the customer
// chose. The server reads the real prices, computes the split, and decides
// whether the order is paid.

import { apiRequest } from './apiClient';

export type PaymentMethod = 'cash' | 'yoco' | 'ozow';

/** What the client is allowed to send when placing an order. */
export type PlaceOrderRequest = {
  storeId: string;
  items: Array<{
    productId: string;
    quantity: number;
    specialInstructions?: string;
  }>;
  deliveryAddress: {
    street: string;
    city: string;
    postalCode: string;
    instructions?: string;
  };
  paymentMethod: PaymentMethod;
  customerPhone: string;
  /** Cash orders only: the note the customer will pay with, for change. */
  cashAmount?: number;
};

export type ApiOrder = {
  id: string;
  status: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** Returned to the customer only; the driver never receives it. */
  deliveryCode?: string;
  storeName: string;
};

export type ApiPayment = {
  id: string;
  orderId: string;
  amount: number;
  status: 'initiated' | 'succeeded' | 'failed' | 'refunded';
  provider: string;
  providerReference: string | null;
  failureReason: string | null;
};

type PaymentInitiation = {
  payment: ApiPayment;
  redirectUrl: string | null;
  clientPayload: Record<string, unknown> | null;
};

/** Place an order. The server prices it. */
export async function placeOrder(
  request: PlaceOrderRequest,
): Promise<ApiOrder> {
  const response = await apiRequest<ApiOrder>('/api/v1/orders', {
    method: 'POST',
    body: request,
  });
  return response.data;
}

/** Start a charge for an order. The amount comes from the order, not from us. */
export async function initiatePayment(
  orderId: string,
): Promise<PaymentInitiation> {
  const response = await apiRequest<ApiPayment>('/api/v1/payments', {
    method: 'POST',
    body: { orderId },
  });

  const meta = (response.meta ?? {}) as {
    redirectUrl?: string | null;
    clientPayload?: Record<string, unknown> | null;
  };

  return {
    payment: response.data,
    redirectUrl: meta.redirectUrl ?? null,
    clientPayload: meta.clientPayload ?? null,
  };
}

/**
 * Ask the server to check with the provider and settle if it succeeded.
 * Idempotent, so it is safe to call again after returning from a redirect.
 */
export async function verifyPayment(paymentId: string): Promise<ApiPayment> {
  const response = await apiRequest<ApiPayment>(
    `/api/v1/payments/${paymentId}/verify`,
    { method: 'POST' },
  );
  return response.data;
}

/**
 * Resolve a sandbox charge.
 *
 * Stands in for the customer completing payment on a real provider's page.
 * This exists only while the API is configured with the sandbox provider; a
 * live provider decides the outcome itself and this call returns 404.
 */
export async function completeSandboxPayment(
  reference: string,
  outcome: 'succeed' | 'fail' = 'succeed',
): Promise<void> {
  await apiRequest(`/api/v1/payments/sandbox/${reference}/complete`, {
    method: 'POST',
    body: { outcome },
  });
}

/** True when an initiation came back from the sandbox provider. */
export function isSandboxPayment(
  clientPayload: Record<string, unknown> | null,
): clientPayload is { simulated: true; reference: string } {
  return clientPayload?.simulated === true;
}
