'use client';

// API client
//
// Talks to the LokshinEats REST API (see server/). Everything that decides
// money — prices, totals, payouts, payment status, delivery codes — now
// happens there. This file only carries requests and translates failures.
//
// Auth reuses the Firebase session the app already has: `getIdToken()` returns
// the current ID token, refreshing it automatically when it is close to
// expiry, and the API verifies it with the Admin SDK. There is no second login
// and no separate token to store.

import { auth } from '../firebase/config';

/** Base URL of the API. Inlined at build time, so it is set per environment. */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') ??
  'http://localhost:4000';

/** Stable error codes the API returns. Branch on these, not on messages. */
export type ApiErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'rate_limited'
  | 'internal'
  | 'network';

/**
 * A failed API call.
 *
 * `message` is safe to show a customer — the API writes them for that. Field
 * errors arrive in `details` keyed by field name.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, string>;
  readonly requestId?: string;

  constructor(init: {
    code: ApiErrorCode;
    status: number;
    message: string;
    details?: Record<string, string>;
    requestId?: string;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
    this.requestId = init.requestId;
  }

  /** First per-field message, for forms that show one error at a time. */
  get firstFieldError(): string | null {
    if (!this.details) return null;
    const values = Object.values(this.details);
    return values.length > 0 ? (values[0] ?? null) : null;
  }
}

type ApiSuccess<T> = { data: T; nextCursor?: string | null; meta?: unknown };

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Set false for endpoints that are public, so a signed-out browse works. */
  authenticated?: boolean;
};

/**
 * Current Firebase ID token.
 *
 * Throws rather than sending an anonymous request, so a signed-out user gets a
 * clear "log in" message instead of an opaque 401 from the server.
 */
async function idToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError({
      code: 'unauthenticated',
      status: 401,
      message: 'Please log in to continue.',
    });
  }
  return user.getIdToken();
}

/** Issue a request and unwrap the `{ data }` envelope. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiSuccess<T>> {
  const { method = 'GET', body, authenticated = true } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authenticated) headers.Authorization = `Bearer ${await idToken()}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    // fetch only rejects on a transport failure: offline, DNS, CORS, or the
    // API not running. Worth distinguishing, because the fix is different.
    throw new ApiError({
      code: 'network',
      status: 0,
      message:
        'Could not reach LokshinEats. Check your connection and try again.',
      details: { cause: String(cause) },
    });
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: Record<string, unknown> } | null)?.error;
    throw new ApiError({
      code: (error?.code as ApiErrorCode) ?? 'internal',
      status: response.status,
      message:
        (error?.message as string) ??
        'Something went wrong. Please try again.',
      details: error?.details as Record<string, string> | undefined,
      requestId: error?.requestId as string | undefined,
    });
  }

  return payload as ApiSuccess<T>;
}

/** True when the API base URL points somewhere other than this machine. */
export function apiBaseUrl(): string {
  return API_BASE_URL;
}
