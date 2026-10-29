/**
 * What a driver tells us about themselves, and whether anyone has checked it.
 *
 * A delivery platform that does not know what its drivers drive cannot match
 * a delivery to a vehicle that can make it, and one that holds no licence
 * details has no answer when a motorbike with its food on the back is in an
 * accident. Until now the API knew neither: the sign-up form collected a
 * licence number and a vehicle registration and threw both away, told the
 * applicant their application would be reviewed within 48 hours, and made
 * them a driver immediately.
 *
 * So: what you drive is required of everyone, a licence and a registration
 * are required of anyone driving something that needs them, and nobody
 * delivers until a human has approved them.
 *
 * Document *photos* are deliberately not here yet. They need file storage,
 * which needs the paid Firebase plan, and holding photographs of people's
 * identity documents brings duties that are worth taking on deliberately
 * rather than by accident. The numbers are recorded now; photographs can be
 * added later without changing any of this.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { toIso, toStringOr } from '../../lib/serialize';

/** What someone delivers on. */
export const VEHICLE_TYPES = ['bicycle', 'motorbike', 'car'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Vehicles the law requires a licence and a registration for. */
export const MOTORISED: readonly VehicleType[] = ['motorbike', 'car'];

export const VERIFICATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type DriverProfile = {
  id: string;
  vehicleType: VehicleType;
  /** Null for a bicycle, which needs neither. */
  licenceNumber: string | null;
  vehicleRegistration: string | null;
  idNumber: string;
  status: VerificationStatus;
  /** Why an application was turned down, shown to the driver. */
  decisionReason: string | null;
  decidedAt: string | null;
  /** The admin who decided. Not shown to the driver. */
  decidedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * Who an application belongs to, for the admin reviewing it.
 *
 * The queue used to show a bare uid: nothing to recognise, nothing to call,
 * and no way to tell an applicant who had already been suspended from one who
 * had not. Served only to admins, with the application itself.
 */
export type DriverAccount = {
  displayName: string;
  email: string;
  phone: string | null;
  /** Of the account, not the application: active, suspended or removed. */
  status: string;
  /**
   * What the account may actually do. Worth showing beside an approval,
   * because the two can disagree - an approved application on an account
   * that is not a driver is somebody who cannot take a single delivery.
   */
  role: string;
};

export type DriverApplication = DriverProfile & {
  account: DriverAccount | null;
};

const trimmed = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, message);

const detailsFields = {
  vehicleType: z.enum(VEHICLE_TYPES, {
    message: 'Tell us what you deliver on.',
  }),
  licenceNumber: trimmed(4, 40, 'Enter your licence number.').optional(),
  vehicleRegistration: trimmed(
    4,
    20,
    'Enter the registration number of your vehicle.',
  ).optional(),
  // Loose on purpose: a South African ID is thirteen digits, but a driver
  // may be here on a passport, and rejecting a valid document is worse than
  // accepting one an admin will look at anyway.
  idNumber: trimmed(6, 20, 'Enter your ID or passport number.'),
};

/**
 * Submitting your details.
 *
 * The cross-field rule is the point: a motorbike or a car without a licence
 * number is not a complete application, and a bicycle with one is somebody
 * confused about what they are telling us.
 */
export const submitDriverDetailsSchema = z
  .object(detailsFields)
  .strict()
  .superRefine((value, ctx) => {
    const motorised = MOTORISED.includes(value.vehicleType);

    if (motorised && !value.licenceNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['licenceNumber'],
        message: `A ${value.vehicleType} needs a driving licence.`,
      });
    }

    if (motorised && !value.vehicleRegistration) {
      ctx.addIssue({
        code: 'custom',
        path: ['vehicleRegistration'],
        message: `A ${value.vehicleType} needs a registration number.`,
      });
    }

    if (!motorised && (value.licenceNumber || value.vehicleRegistration)) {
      ctx.addIssue({
        code: 'custom',
        path: ['vehicleType'],
        message:
          'A bicycle needs no licence or registration. Choose the vehicle you '
          + 'actually deliver on.',
      });
    }
  });

export type SubmitDriverDetailsInput = z.infer<
  typeof submitDriverDetailsSchema
>;

export const decideDriverSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    /** Shown to the driver, so it has to say something useful. */
    reason: trimmed(3, 300, 'Say why, so the driver can fix it.').optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'reject' && !value.reason) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Say why it was turned down.',
      });
    }
  });

export const driverIdParamSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const listDriversQuerySchema = z.object({
  status: z.enum(VERIFICATION_STATUSES).optional(),
});

export function toDriverProfile(snapshot: DocumentSnapshot): DriverProfile {
  const data = snapshot.data() ?? {};
  const vehicleType = data.vehicleType;
  const status = data.status;

  return {
    id: snapshot.id,
    vehicleType: (VEHICLE_TYPES as readonly string[]).includes(vehicleType)
      ? (vehicleType as VehicleType)
      : 'bicycle',
    licenceNumber: data.licenceNumber ? toStringOr(data.licenceNumber) : null,
    vehicleRegistration: data.vehicleRegistration
      ? toStringOr(data.vehicleRegistration)
      : null,
    idNumber: toStringOr(data.idNumber),
    status: (VERIFICATION_STATUSES as readonly string[]).includes(status)
      ? (status as VerificationStatus)
      : 'pending',
    decisionReason: data.decisionReason
      ? toStringOr(data.decisionReason)
      : null,
    decidedAt: toIso(data.decidedAt),
    decidedBy: data.decidedBy ? toStringOr(data.decidedBy) : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
