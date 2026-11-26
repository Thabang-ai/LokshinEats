// The signed-in person's own profile, from the API.
//
// Sign-up and first sign-in used to write `users/{uid}` straight from the
// browser, role included, and the rules allowed any role but `admin`. The
// API falls back to that document when a token carries no role claim, so a
// page - or anyone with devtools open - could hand itself `vendor` or
// `driver`.
//
// The API decides roles now: a customer or a driver applicant at sign-up,
// vendor only by registering a kitchen, driver only once an admin approves
// the application. It writes the document with the Admin SDK and sets the
// matching custom claim, which a browser cannot forge.

import { ApiError, apiRequest } from './apiClient';

export type ApiRole = 'customer' | 'driver' | 'vendor' | 'admin';

export type ApiUserProfile = {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  address: { street: string; city: string; postalCode: string } | null;
  role: ApiRole;
  status: 'active' | 'suspended' | 'removed';
  statusReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** This account's profile, or null when it has none yet. */
export async function fetchMyProfile(): Promise<ApiUserProfile | null> {
  try {
    const response = await apiRequest<ApiUserProfile>('/api/v1/users/me');
    return response.data;
  } catch (error) {
    // 404 is an answer, not a failure: signed in to Firebase, no profile.
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Create this account's profile, straight after Firebase Auth sign-up.
 *
 * `role` is only ever `customer` or `driver` - the API refuses anything else
 * here. A driver chosen at sign-up is an applicant and nothing more: they
 * deliver once an admin approves them, which is what grants the role that
 * actually opens the delivery routes.
 */
export async function createMyProfile(input: {
  displayName: string;
  phone?: string;
  role?: 'customer' | 'driver';
}): Promise<ApiUserProfile> {
  const response = await apiRequest<ApiUserProfile>('/api/v1/users/me', {
    method: 'POST',
    body: {
      displayName: input.displayName,
      ...(input.phone ? { phone: input.phone.replace(/\s/g, '') } : {}),
      role: input.role ?? 'customer',
    },
  });

  return response.data;
}

/** Where this account belongs after signing in. */
export function homeFor(role: ApiRole): string {
  switch (role) {
    case 'vendor':
      return '/vendor/dashboard';
    case 'driver':
      return '/driver/dashboard';
    case 'admin':
      return '/admin';
    default:
      return '/restaurants';
  }
}
