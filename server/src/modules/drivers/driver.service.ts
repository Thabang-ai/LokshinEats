/**
 * Driver verification rules.
 *
 * The one that matters: `assertApproved` is what stands between someone
 * filling in a form and someone carrying a stranger's dinner. Everything
 * else here exists to get a human to that decision.
 */

import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import type { AuthContext } from '../../middleware/auth';
import * as notificationService from '../notifications/notification.service';
import type {
  DriverProfile,
  SubmitDriverDetailsInput,
  VerificationStatus,
} from './driver.model';
import * as repository from './driver.repository';

const log = moduleLogger('drivers');

export async function getOwn(uid: string): Promise<DriverProfile | null> {
  return repository.findById(uid);
}

/** Submit, or resubmit, your own details for review. */
export async function submitOwnDetails(
  caller: AuthContext,
  input: SubmitDriverDetailsInput,
): Promise<DriverProfile> {
  const profile = await repository.submitDetails(caller.uid, input);

  log.info(
    { driverId: caller.uid, vehicleType: profile.vehicleType },
    'Driver submitted details for review.',
  );

  return profile;
}

/**
 * Whether this driver may take deliveries, and a reason they can act on if
 * not.
 *
 * Called where a delivery is claimed rather than at sign-in, because that is
 * the moment it matters: an approval can be withdrawn while someone has the
 * app open.
 */
export async function assertApproved(uid: string): Promise<void> {
  const profile = await repository.findById(uid);

  if (!profile) {
    throw ApiError.forbidden(
      'Tell us what you deliver on before taking a delivery.',
    );
  }

  if (profile.status === 'pending') {
    throw ApiError.forbidden(
      'Your details are still being checked. You can take deliveries once '
        + 'they are approved.',
    );
  }

  if (profile.status === 'rejected') {
    throw ApiError.forbidden(
      profile.decisionReason ??
        'Your application was turned down. Update your details to apply again.',
    );
  }
}

export async function listForReview(options: {
  status?: VerificationStatus;
}): Promise<DriverProfile[]> {
  return repository.list(options);
}

/**
 * An admin approves or turns down a driver.
 *
 * The driver is told either way, and a refusal carries the reason: an
 * application that fails silently is one the person will submit again
 * unchanged.
 */
export async function decide(
  actor: AuthContext,
  driverId: string,
  input: { decision: 'approve' | 'reject'; reason?: string },
): Promise<DriverProfile> {
  const existing = await repository.findById(driverId);
  if (!existing) throw ApiError.notFound('No such driver application.');

  const status: VerificationStatus =
    input.decision === 'approve' ? 'approved' : 'rejected';

  const profile = await repository.decide(driverId, {
    status,
    reason: input.reason ?? null,
    decidedBy: actor.uid,
  });

  log.info(
    { driverId, decision: status, by: actor.uid },
    'Driver application decided.',
  );

  await notificationService.notifyDrivers({
    driverIds: [driverId],
    orderId: null,
    kind: status === 'approved' ? 'driver_approved' : 'driver_rejected',
    facts: { storeName: '', decisionReason: profile.decisionReason ?? undefined },
  });

  return profile;
}
