'use client';

// Orders and payments, via the API.
//
// Replaces the old flow, where the browser priced the order, ran a simulated
// payment, invented a delivery code, and wrote the whole document to Firestore
// itself. The request below carries no prices at all: just what the customer
// chose. The server reads the real prices, computes the split, and decides
// whether the order is paid.

import { ApiError, apiRequest } from './apiClient';

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

/**
 * Read one order.
 *
 * The customer's own view is the only client path to the delivery code: it is
 * no longer stored on the order document, so a driver reading that document
 * from Firestore finds nothing. The server fetches it from a collection no
 * client can touch and attaches it for the customer alone.
 */
export async function getOrder(orderId: string): Promise<ApiOrder> {
  const response = await apiRequest<ApiOrder>(`/api/v1/orders/${orderId}`);
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

// ---- Vendor and driver operations ----------------------------------------
//
// These replace direct Firestore writes from the vendor and driver pages.
// Reads stay on Firestore, so the live order feeds keep updating in real time;
// only the writes moved, which is where the security problem was.

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

/** Move an order along. The server checks the transition and the caller. */
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<ApiOrder> {
  const response = await apiRequest<ApiOrder>(
    `/api/v1/orders/${orderId}/status`,
    { method: 'PATCH', body: { status } },
  );
  return response.data;
}

/**
 * Claim a delivery.
 *
 * The server resolves the race: two drivers tapping at once, only one wins,
 * and the loser is told the order is taken.
 */
export async function acceptOrder(orderId: string): Promise<ApiOrder> {
  const response = await apiRequest<ApiOrder>(
    `/api/v1/orders/${orderId}/accept`,
    { method: 'POST' },
  );
  return response.data;
}

/** Give a claim back to the pool, before collection. */
export async function releaseOrder(orderId: string): Promise<ApiOrder> {
  const response = await apiRequest<ApiOrder>(
    `/api/v1/orders/${orderId}/release`,
    { method: 'POST' },
  );
  return response.data;
}

export type DeliveryOutcome =
  | { ok: true; order: ApiOrder }
  | { ok: false; message: string; attemptsRemaining?: number };

/**
 * Confirm a delivery with the customer's code.
 *
 * The comparison happens on the server against a code this app is never sent.
 * A wrong code is an expected outcome rather than an error, so it comes back
 * as a result the UI can show inline with the attempts left.
 */
export async function completeDelivery(
  orderId: string,
  code: string,
): Promise<DeliveryOutcome> {
  try {
    const response = await apiRequest<ApiOrder>(
      `/api/v1/orders/${orderId}/complete`,
      { method: 'POST', body: { code } },
    );
    return { ok: true, order: response.data };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      const remaining = error.details?.attemptsRemaining;
      return {
        ok: false,
        message: error.message,
        ...(remaining !== undefined
          ? { attemptsRemaining: Number(remaining) }
          : {}),
      };
    }
    throw error;
  }
}

/**
 * Record handing the vendor their cash on a cash order.
 *
 * No amount is sent — the server computes what is owed from the order.
 */
export async function recordCashHandover(orderId: string): Promise<ApiOrder> {
  const response = await apiRequest<ApiOrder>(
    `/api/v1/orders/${orderId}/cash-handover`,
    { method: 'POST' },
  );
  return response.data;
}

/** The vendor's response to that handover. */
export async function settleCashReceipt(
  orderId: string,
  outcome: 'confirm' | 'dispute',
): Promise<ApiOrder> {
  const response = await apiRequest<ApiOrder>(
    `/api/v1/orders/${orderId}/cash-receipt`,
    { method: 'POST', body: { outcome } },
  );
  return response.data;
}

/** True when an initiation came back from the sandbox provider. */
export function isSandboxPayment(
  clientPayload: Record<string, unknown> | null,
): clientPayload is { simulated: true; reference: string } {
  return clientPayload?.simulated === true;
}
