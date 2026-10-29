'use client';

// Ratings, through the API.
//
// They used to be written straight from the browser: a review document, plus
// a transaction that moved the kitchen's average. The rules allowed any
// signed-in account to do both for any kitchen, which makes a rating worth
// about as much as the kitchen's own description of itself. The API checks
// the one thing that matters - that this is your order, and that it arrived -
// and owns the average.

import { apiRequest } from './apiClient';

export type ReviewTarget = 'store' | 'driver';

export type Review = {
  id: string;
  orderId: string;
  target: ReviewTarget;
  subjectId: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string | null;
  createdAt: string | null;
};

/** Rate the kitchen, the driver, or both, for one delivered order. */
export async function submitReview(
  orderId: string,
  input: {
    store?: { rating: number; comment?: string };
    driver?: { rating: number; comment?: string };
  },
): Promise<Review[]> {
  const response = await apiRequest<Review[]>(
    `/api/v1/reviews/orders/${encodeURIComponent(orderId)}`,
    { method: 'POST', body: input },
  );
  return response.data ?? [];
}

/** What this customer has already said about an order. */
export async function fetchOrderReviews(orderId: string): Promise<Review[]> {
  const response = await apiRequest<Review[]>(
    `/api/v1/reviews/orders/${encodeURIComponent(orderId)}`,
  );
  return response.data ?? [];
}

/** What people said about a kitchen. Public. */
export async function fetchStoreReviews(
  storeId: string,
  limit = 20,
): Promise<Review[]> {
  const response = await apiRequest<Review[]>(
    `/api/v1/reviews/stores/${encodeURIComponent(storeId)}?limit=${limit}`,
    { authenticated: false },
  );
  return response.data ?? [];
}
