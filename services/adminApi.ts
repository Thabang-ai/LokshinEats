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

/** Whether an account may use the platform at all, apart from what it may do. */
export type AccountStatus = 'active' | 'suspended' | 'removed';

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  role: UserRole;
  status: AccountStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
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

/**
 * Suspend an account, or lift a suspension.
 *
 * A suspension takes hold at once: the API disables the sign-in and ends the
 * session they have open, so a driver suspended mid-shift stops on their next
 * tap rather than when their token happens to expire. A suspended vendor's
 * kitchen is closed with them.
 */
export async function setAccountStatus(
  userId: string,
  status: Exclude<AccountStatus, 'removed'>,
  reason?: string,
): Promise<AdminUser> {
  const response = await apiRequest<AdminUser>(
    `/api/v1/users/${encodeURIComponent(userId)}/status`,
    { method: 'PATCH', body: { status, ...(reason ? { reason } : {}) } },
  );
  return response.data;
}

/**
 * Remove an account from the platform.
 *
 * Their sign-in is deleted, which frees the email address - somebody removed
 * by mistake can start again. The profile stays, marked, because their old
 * orders point at it. The API refuses while they are still part of an
 * unfinished order.
 */
export async function removeUser(
  userId: string,
  reason: string,
): Promise<AdminUser> {
  const response = await apiRequest<AdminUser>(
    `/api/v1/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE', body: { reason } },
  );
  return response.data;
}

/**
 * Decide a disputed cash handover.
 *
 * The driver says they paid the kitchen; the kitchen says it never arrived.
 * Nothing automatic follows from a dispute - a kitchen that could suspend a
 * driver by raising one would be a kitchen with a weapon - so it waits here
 * for a person.
 *
 * `uphold` believes the kitchen: the claim is struck off and the driver owes
 * the money again, under a deadline that has already been running. `dismiss`
 * believes the driver: the receipt stands, the money moves, and any
 * suspension over it is lifted.
 */
export async function resolveCashDispute(
  orderId: string,
  outcome: 'uphold' | 'dismiss',
  note?: string,
): Promise<AdminApiOrder> {
  const response = await apiRequest<AdminApiOrder>(
    `/api/v1/cash/disputes/${encodeURIComponent(orderId)}`,
    { method: 'POST', body: { outcome, ...(note ? { note } : {}) } },
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Kitchens awaiting a decision
// ---------------------------------------------------------------------------

export type StoreVerificationStatus = 'pending' | 'approved' | 'rejected';

/** A kitchen as the review queue shows it. */
export type ReviewStore = {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  ownerId: string;
  address: string;
  city: string;
  phone: string | null;
  email: string | null;
  openingTime: string | null;
  closingTime: string | null;
  categories: string[];
  logo: string | null;
  banner: string | null;
  verification: StoreVerificationStatus;
  verificationReason: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  isOpen: boolean;
  /** Where it delivers. Empty means anywhere, which is where kitchens start. */
  deliveryAreas: string[];
  rating: number;
  reviewCount: number;
  createdAt: string | null;
};

/** Every kitchen, or only those in one state. */
export async function fetchStoresForReview(
  status?: StoreVerificationStatus,
): Promise<ReviewStore[]> {
  const query = status ? `?status=${status}` : '';
  const response = await apiRequest<ReviewStore[]>(
    `/api/v1/stores/review${query}`,
  );
  return response.data ?? [];
}

/**
 * Approve a kitchen, or turn it down.
 *
 * A refusal needs a reason: the vendor is shown it when they next try to
 * open, and one that says nothing is a registration they will send again
 * unchanged. Turning a kitchen down closes it in the same write.
 */
export async function decideStore(
  storeId: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<ReviewStore> {
  const response = await apiRequest<ReviewStore>(
    `/api/v1/stores/${encodeURIComponent(storeId)}/verification`,
    { method: 'POST', body: { decision, ...(reason ? { reason } : {}) } },
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/**
 * A day's money, told apart.
 *
 * Four quantities that one figure hides: what customers paid, how much of it
 * the platform never touched because a driver took it in cash at a door,
 * what the kitchens and drivers are owed, and what the platform earned.
 */
export type DayReconciliation = {
  date: string;
  orders: { total: number; cash: number; card: number; cancelled: number };
  collected: { total: number; card: number; cash: number };
  distributed: {
    vendorPayouts: number;
    driverPay: number;
    platformRevenue: number;
  };
  refunds: { total: number; count: number };
  cashInDriverHands: { amount: number; orders: number };
  unbalanced: Array<{ orderId: string; paid: number; distributed: number }>;
  balances: boolean;
};

/** One South African calendar day, reconciled. `date` is YYYY-MM-DD. */
export async function fetchReconciliation(
  date: string,
): Promise<DayReconciliation> {
  const response = await apiRequest<DayReconciliation>(
    `/api/v1/reports/reconciliation/${encodeURIComponent(date)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Wallets and their ledgers
// ---------------------------------------------------------------------------

/** The platform's own wallet id. Every other wallet shares its owner's id. */
export const PLATFORM_WALLET = 'platform';

export type AdminWallet = {
  id: string;
  ownerId: string;
  availableBalance: number;
  pendingBalance: number;
  totalBalance: number;
  updatedAt: string | null;
};

export type LedgerEntryType =
  | 'order_earning'
  | 'commission'
  | 'refund'
  | 'bonus'
  | 'withdrawal'
  | 'adjustment'
  | 'goodwill'
  /** A driver collecting a cash order's total at the door. */
  | 'cash_collected'
  /** The kitchen confirming it received its share of that cash. */
  | 'cash_handover';

export type LedgerEntry = {
  id: string;
  walletId: string;
  type: LedgerEntryType;
  /** Signed: positive credits the wallet, negative debits it. */
  amount: number;
  balance: 'available' | 'pending';
  /** The balance in that bucket immediately after this entry. */
  balanceAfter: number;
  orderId: string | null;
  paymentId: string | null;
  description: string;
  createdAt: string | null;
};

export type LedgerPage = {
  entries: LedgerEntry[];
  nextCursor: string | null;
};

/** Any wallet, by the id of whoever owns it — or {@link PLATFORM_WALLET}. */
export async function fetchWallet(ownerId: string): Promise<AdminWallet> {
  const response = await apiRequest<AdminWallet>(
    `/api/v1/wallets/${encodeURIComponent(ownerId)}`,
  );
  return response.data;
}

/** A wallet's ledger, newest first. */
export async function fetchLedger(
  ownerId: string,
  cursor?: string | null,
): Promise<LedgerPage> {
  const params = new URLSearchParams({ limit: '50' });
  if (cursor) params.set('cursor', cursor);

  const response = await apiRequest<LedgerEntry[]>(
    `/api/v1/wallets/${encodeURIComponent(ownerId)}/transactions?${params.toString()}`,
  );

  return {
    entries: response.data ?? [],
    nextCursor: response.nextCursor ?? null,
  };
}

/** One account, for putting a name to a wallet. */
export async function fetchUser(userId: string): Promise<AdminUser> {
  const response = await apiRequest<AdminUser>(
    `/api/v1/users/${encodeURIComponent(userId)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Driver verification
// ---------------------------------------------------------------------------

export type DriverVerificationStatus = 'pending' | 'approved' | 'rejected';

export type DriverApplication = {
  id: string;
  vehicleType: 'bicycle' | 'motorbike' | 'car';
  licenceNumber: string | null;
  vehicleRegistration: string | null;
  idNumber: string;
  status: DriverVerificationStatus;
  decisionReason: string | null;
  /** The admin who decided it. An approval is somebody's decision. */
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /**
   * Who applied. Null only if the profile is gone, which is worth seeing
   * rather than hiding the application.
   */
  account: {
    displayName: string;
    email: string;
    phone: string | null;
    status: AccountStatus;
    /** What the account may do. An approval does not help if this is not a driver. */
    role: UserRole;
  } | null;
};

/**
 * Driver applications, newest first.
 *
 * Nobody delivers until one of these is approved, so an untended queue is
 * drivers who cannot work.
 */
export async function fetchDriverApplications(
  status?: DriverVerificationStatus,
): Promise<DriverApplication[]> {
  const query = status ? `?status=${status}` : '';
  const response = await apiRequest<DriverApplication[]>(
    `/api/v1/drivers${query}`,
  );
  return response.data ?? [];
}

/**
 * Approve or turn down an application.
 *
 * A refusal needs a reason: the driver is shown it, and one that says nothing
 * is one they will send again unchanged.
 */
export async function decideDriverApplication(
  driverId: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<DriverApplication> {
  const response = await apiRequest<DriverApplication>(
    `/api/v1/drivers/${driverId}/verification`,
    { method: 'PATCH', body: { decision, ...(reason ? { reason } : {}) } },
  );
  return response.data;
}

/* ------------------------------------------------------------------ *
 * The dashboard, and the record of what admins have done.
 * ------------------------------------------------------------------ */

export type PlatformMetrics = {
  /** The South African calendar day the "today" figures cover. */
  date: string;
  today: {
    orders: number;
    delivered: number;
    cancelled: number;
    takings: number;
    platformShare: number;
  };
  live: {
    pending: number;
    preparing: number;
    ready: number;
    onTheWay: number;
    unclaimed: number;
  };
  waiting: {
    kitchens: number;
    drivers: number;
    cashDisputes: number;
  };
  totals: {
    kitchens: number;
    drivers: number;
    customers: number;
  };
};

/** Today's numbers, or a given South African day's. */
export async function fetchMetrics(date?: string): Promise<PlatformMetrics> {
  const response = await apiRequest<PlatformMetrics>(
    `/api/v1/reports/metrics${date ? `?date=${date}` : ''}`,
  );
  return response.data;
}

export const AUDIT_ACTIONS = [
  'store.approved',
  'store.rejected',
  'driver.approved',
  'driver.rejected',
  'user.role_changed',
  'user.suspended',
  'user.reinstated',
  'user.removed',
  'order.cancelled',
  'cash.dispute_resolved',
  'wallet.credited',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntry = {
  id: string;
  action: AuditAction;
  actorId: string;
  actorName: string;
  subjectType: 'store' | 'driver' | 'user' | 'order';
  subjectId: string;
  subjectName: string;
  reason: string | null;
  amount: number | null;
  facts: Record<string, string>;
  createdAt: string | null;
};

export type AuditPage = {
  entries: AuditEntry[];
  nextCursor: string | null;
};

/**
 * What admins have done, newest first.
 *
 * Read-only by design: there is no endpoint that writes one of these by
 * hand, and none that edits or deletes one.
 */
export async function fetchAuditLog(options: {
  action?: AuditAction;
  actorId?: string;
  subjectId?: string;
  limit?: number;
  cursor?: string;
} = {}): Promise<AuditPage> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 50) });
  if (options.action) query.set('action', options.action);
  if (options.actorId) query.set('actorId', options.actorId);
  if (options.subjectId) query.set('subjectId', options.subjectId);

  const response = await apiRequest<AuditEntry[]>(
    `/api/v1/audit?${query.toString()}`,
  );

  return {
    entries: response.data ?? [],
    nextCursor: (response as { nextCursor?: string | null }).nextCursor ?? null,
  };
}
