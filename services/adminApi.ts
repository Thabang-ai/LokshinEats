'use client';

// The operator console, via the API.
//
// The console used to read the orders collection straight from the browser
// with an onSnapshot listener. That worked, but it went around the one place
// that decides what anybody may see: an admin's browser was reading raw
// documents, including the delivery codes that are supposed to live only with
// the customer whose order it is. These calls go through the API instead, so
// the console sees exactly what the API says an admin may see — no more, and
// scoped by the same rules everything else obeys.
//
// The other half is acting on an order. The console's old "reset to pending"
// wrote to Firestore directly, which could put an order into a state its
// money had already moved past. Cancelling through the API applies the
// cancellation tiers, moves the money, and records what it did.

import { apiRequest } from './apiClient';

export type AdminOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

/** An order as the API serves it to an admin. */
export type AdminApiOrder = {
  id: string;
  status: AdminOrderStatus;
  customerName: string;
  customerPhone: string | null;
  storeId: string;
  storeName: string;
  driverId: string | null;
  items: Array<{ name: string; quantity: number }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  vendorPayout: number;
  driverPayout: number;
  platformEarnings: number;
  refundedAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  cashGivenToVendor: boolean;
  vendorCashConfirmed: boolean;
  vendorCashDisputed: boolean;
  createdAt: string | null;
  cancellation: {
    stage: string;
    initiator: string;
    customerRefund: number;
    vendorPay: number;
    driverPay: number;
    /** Platform-covered. Served to admins only. */
    goodwill?: number;
  } | null;
};

export type AdminOrderPage = {
  orders: AdminApiOrder[];
  nextCursor: string | null;
};

/**
 * Every order on the platform, newest first.
 *
 * Paginated, unlike the listener it replaces: that one held the entire
 * collection open in the browser, which was fine for a pilot and would stop
 * being fine well before anyone noticed.
 */
export async function fetchAllOrders(options: {
  cursor?: string | null;
  limit?: number;
  status?: AdminOrderStatus;
} = {}): Promise<AdminOrderPage> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.status) params.set('status', options.status);

  const response = await apiRequest<AdminApiOrder[]>(
    `/api/v1/orders?${params.toString()}`,
  );

  return {
    orders: response.data ?? [],
    nextCursor: response.nextCursor ?? null,
  };
}

/** What cancelling an order would cost right now, as the API works it out. */
export type CancellationPreview = {
  allowed: boolean;
  code: 'terminal' | 'not_permitted' | 'needs_admin' | null;
  reason: string | null;
  stage: 'before_prep' | 'in_kitchen' | 'on_the_way' | null;
  customerRefund: number;
  vendorPay: number;
  driverPay: number;
  /** What the platform would absorb. Admins see this; nobody else does. */
  goodwill?: number;
};

export async function previewCancellation(
  orderId: string,
): Promise<CancellationPreview> {
  const response = await apiRequest<CancellationPreview>(
    `/api/v1/orders/${orderId}/cancellation-preview`,
  );
  return response.data;
}

/**
 * Cancel an order as the platform.
 *
 * `expectedStage` is the stage the preview was worked out for. If the order
 * has moved on since, the API refuses rather than settling at figures the
 * operator was never shown.
 */
export async function cancelOrder(
  orderId: string,
  expectedStage: string,
): Promise<AdminApiOrder> {
  const response = await apiRequest<AdminApiOrder>(
    `/api/v1/orders/${orderId}/status`,
    { method: 'PATCH', body: { status: 'cancelled', expectedStage } },
  );
  return response.data;
}

/** A platform wallet balance, in rands. */
export type WalletBalance = {
  id: string;
  ownerId: string;
  availableBalance: number;
  pendingBalance: number;
};

/**
 * The platform's own wallet.
 *
 * This is the real number: commission that has actually settled, minus every
 * goodwill refund the platform has covered. The per-order earnings shown on
 * the feed are what each order is expected to yield; this is what is there.
 */
export async function fetchPlatformWallet(): Promise<WalletBalance> {
  const response = await apiRequest<WalletBalance>('/api/v1/wallets/platform');
  return response.data;
}

// ---------------------------------------------------------------------------
// People and their roles
// ---------------------------------------------------------------------------

export type UserRole = 'customer' | 'vendor' | 'driver' | 'admin';

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  role: UserRole;
  createdAt: string | null;
};

export type AdminUserPage = {
  users: AdminUser[];
  nextCursor: string | null;
};

/** Everyone with an account, optionally only those holding one role. */
export async function fetchUsers(options: {
  cursor?: string | null;
  role?: UserRole;
  limit?: number;
} = {}): Promise<AdminUserPage> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.role) params.set('role', options.role);

  const response = await apiRequest<AdminUser[]>(
    `/api/v1/users?${params.toString()}`,
  );

  return {
    users: response.data ?? [],
    nextCursor: response.nextCursor ?? null,
  };
}

/**
 * Give someone a different role.
 *
 * Takes effect immediately in both directions: the API revokes their current
 * session, so a removed role stops working now rather than when their token
 * expires, and they sign in again to pick up the new one. The API refuses an
 * admin removing their own admin role.
 */
export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<AdminUser> {
  const response = await apiRequest<AdminUser>(`/api/v1/users/${userId}/role`, {
    method: 'PATCH',
    body: { role },
  });
  return response.data;
}
