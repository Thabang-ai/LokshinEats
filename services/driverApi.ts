'use client';

// Driver verification, via the API.
//
// What someone drives, and the licence and registration that go with it, are
// what the platform decides with: whether they may deliver at all, and which
// deliveries they are offered. So they are validated and stored server-side,
// not written from a browser, and the account they belong to is taken from
// the caller's token rather than the request.

import { apiRequest } from './apiClient';

export type VehicleType = 'bicycle' | 'motorbike' | 'car';

export type DriverVerification = {
  id: string;
  vehicleType: VehicleType;
  licenceNumber: string | null;
  vehicleRegistration: string | null;
  idNumber: string;
  status: 'pending' | 'approved' | 'rejected';
  decisionReason: string | null;
};

/**
 * Submit, or resubmit, your own details for review.
 *
 * A bicycle must not carry a licence or a registration — the API refuses the
 * pair, because somebody claiming both is somebody confused about what they
 * are telling us — so those fields are omitted rather than sent empty.
 */
export async function submitDriverDetails(input: {
  vehicleType: VehicleType;
  idNumber: string;
  licenceNumber?: string;
  vehicleRegistration?: string;
}): Promise<DriverVerification> {
  const needsPapers = input.vehicleType !== 'bicycle';

  const response = await apiRequest<DriverVerification>('/api/v1/drivers/me', {
    method: 'POST',
    body: {
      vehicleType: input.vehicleType,
      idNumber: input.idNumber.trim(),
      ...(needsPapers && input.licenceNumber
        ? { licenceNumber: input.licenceNumber.trim() }
        : {}),
      ...(needsPapers && input.vehicleRegistration
        ? { vehicleRegistration: input.vehicleRegistration.trim() }
        : {}),
    },
  });

  return response.data;
}

/** This driver's own application, or null if they have not made one. */
export async function fetchMyDriverVerification(): Promise<DriverVerification | null> {
  const response = await apiRequest<DriverVerification | null>(
    '/api/v1/drivers/me',
  );
  return response.data ?? null;
}
