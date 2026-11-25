// Kitchens, from the API.
//
// Every page on this site used to read the `stores` collection straight out
// of Firestore. That worked, and it quietly skipped every rule the API
// enforces in its serialiser: the R12 delivery fee (old store documents still
// carry whatever fee they were registered with), the opening hours, the
// review queue, and where a kitchen will actually deliver. The site showed
// R20 while checkout charged R12, listed kitchens no admin had approved, and
// sold deliveries to townships nobody was driving to.
//
// Reads here are public - no token, no sign-in - exactly like the apps'.

import { apiRequest } from './apiClient';

export type StoreVerification = 'pending' | 'approved' | 'rejected';

/** A kitchen, as the API serves it. Mirrors `server/src/modules/stores`. */
export type ApiStore = {
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
  image: string | null;
  logo: string | null;
  banner: string | null;
  /** The platform's fee, the same from every kitchen. */
  deliveryFee: number;
  verification: StoreVerification;
  verificationReason: string | null;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  minOrderAmount: number;
  /** Taking orders right now: the switch AND the clock. */
  isOpen: boolean;
  /** The vendor's own switch, which `isOpen` alone cannot tell you about. */
  switchedOn: boolean;
  hoursMode: 'manual' | 'scheduled';
  /** Where it delivers, its own city included. Empty means anywhere. */
  deliveryAreas: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type ApiProduct = {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string | null;
  available: boolean;
  isVegetarian: boolean;
  isSpicy: boolean;
  preparationTime: number;
};

export type ApiStoreReview = {
  id: string;
  orderId: string;
  subjectId: string;
  customerId: string;
  /** Shown with the review, because "A customer" says nothing. */
  customerName: string;
  rating: number;
  comment: string | null;
  createdAt: string | null;
};

/**
 * The kitchens a customer may browse.
 *
 * 100 is the API's own maximum page, and this site has never paginated the
 * list; it showed the whole collection. Past a hundred kitchens this needs
 * the cursor the API already returns.
 */
export async function fetchStores(
  options: { openOnly?: boolean; deliversTo?: string; limit?: number } = {},
): Promise<ApiStore[]> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 100) });
  if (options.openOnly) query.set('openOnly', 'true');
  if (options.deliversTo) query.set('deliversTo', options.deliversTo);

  const response = await apiRequest<ApiStore[]>(
    `/api/v1/stores?${query.toString()}`,
    { authenticated: false },
  );

  return response.data ?? [];
}

/** One kitchen. 404 for one no admin has approved, which is deliberate. */
export async function fetchStore(storeId: string): Promise<ApiStore> {
  const response = await apiRequest<ApiStore>(
    `/api/v1/stores/${encodeURIComponent(storeId)}`,
    { authenticated: false },
  );

  return response.data;
}

/** A kitchen's menu. Available items only, as a customer wants it. */
export async function fetchStoreMenu(storeId: string): Promise<ApiProduct[]> {
  const query = new URLSearchParams({
    storeId,
    availableOnly: 'true',
    limit: '100',
  });

  const response = await apiRequest<ApiProduct[]>(
    `/api/v1/products?${query.toString()}`,
    { authenticated: false },
  );

  return response.data ?? [];
}

export async function fetchStoreReviews(
  storeId: string,
  limit = 5,
): Promise<ApiStoreReview[]> {
  const response = await apiRequest<ApiStoreReview[]>(
    `/api/v1/reviews/stores/${encodeURIComponent(storeId)}?limit=${limit}`,
    { authenticated: false },
  );

  return response.data ?? [];
}

/** This vendor's own kitchen, whatever state it is in. */
export async function fetchMyStore(): Promise<ApiStore | null> {
  try {
    const response = await apiRequest<ApiStore>('/api/v1/stores/mine');
    return response.data;
  } catch (error) {
    // 404 is "signed in, no kitchen yet"; 403 is an account the API does not
    // consider a vendor at all, which amounts to the same thing here. Both
    // are answers, not failures: registering a kitchen is what fixes them.
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 403) return null;
    throw error;
  }
}

/** Open or close the kitchen to new orders. */
export async function setMyStoreOpen(isOpen: boolean): Promise<ApiStore> {
  const response = await apiRequest<ApiStore>('/api/v1/stores/mine', {
    method: 'PATCH',
    body: { isOpen },
  });

  return response.data;
}

/**
 * Register a kitchen for the signed-in account.
 *
 * This is what makes the account a vendor, and the role arrives as a Firebase
 * custom claim - so the token already in hand still says `customer` and every
 * vendor route refuses it until it is refreshed. The caller must do that
 * before its next authenticated call; a full page load does it too.
 */
export async function registerStore(input: {
  name: string;
  cuisine: string;
  address: string;
  city: string;
  phone?: string;
  email?: string;
  description?: string;
  openingTime?: string;
  closingTime?: string;
  categories?: string[];
}): Promise<ApiStore> {
  const response = await apiRequest<ApiStore>('/api/v1/stores', {
    method: 'POST',
    body: input,
  });

  return response.data;
}
