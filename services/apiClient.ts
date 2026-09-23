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

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';

/** Where the deployed API lives. Part of this system, not a per-deploy choice. */
const PRODUCTION_API = 'https://lokshineats-api.vercel.app';

/**
 * Base URL of the API.
 *
 * NEXT_PUBLIC_API_BASE_URL wins when it is set, which is how a local build
 * points at a local API and how a future deployment could point somewhere
 * else. It is inlined at build time, though, so a build made without it - a
 * preview, a rebuild from a branch, a project set up again - silently ships a
 * site that calls localhost from the customer's browser. Every request then
 * fails with a connection error that names the customer's own machine.
 *
 * So anything served from a real domain falls back to the deployed API rather
 * than to localhost. Only a page opened on localhost defaults to a local API,
 * where that is what a developer means.
 */
function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');
  if (configured) return configured;

  const host = typeof window === 'undefined' ? '' : window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';

  return isLocal ? 'http://localhost:4000' : PRODUCTION_API;
}

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
 * Resolves once Firebase has decided who is signed in.
 *
 * On a fresh page load the SDK restores the session from IndexedDB
 * asynchronously, so `auth.currentUser` is null for the first moments even
 * for someone who is signed in. Any screen that fetches on mount would
 * otherwise be told to log in while it was already logged in — which is what
 * the operator console did on every refresh.
 *
 * Created once and reused: the listener fires on the first resolution and
 * unsubscribes itself.
 */
let authResolved: Promise<void> | null = null;

function authReady(): Promise<void> {
  authResolved ??= new Promise<void>((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      () => {
        unsubscribe();
        resolve();
      },
      () => {
        // A listener failure is still an answer: nobody is signed in.
        unsubscribe();
        resolve();
      },
    );
  });

  return authResolved;
}

/**
 * Current Firebase ID token.
 *
 * Throws rather than sending an anonymous request, so a signed-out user gets a
 * clear "log in" message instead of an opaque 401 from the server — but only
 * once Firebase has actually said there is nobody signed in.
 */
async function idToken(): Promise<string> {
  if (!auth.currentUser) await authReady();

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
    response = await fetch(`${resolveApiBaseUrl()}${path}`, {
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

/** Where requests are going right now. */
export function apiBaseUrl(): string {
  return resolveApiBaseUrl();
}
