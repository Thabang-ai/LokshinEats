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
import * as userService from '../users/user.service';
import * as userRepository from '../users/user.repository';
import type {
  DriverApplication,
  DriverProfile,
  SubmitDriverDetailsInput,
  VerificationStatus,
} from './driver.model';
import * as repository from './driver.repository';

const log = moduleLogger('drivers');

/**
 * This driver's own application, and whether their token is out of date.
 *
 * Being approved is what makes somebody a driver, but approval used to change
 * only the application: the account kept the customer role it signed up with,
 * and every delivery route answered "This endpoint requires the driver or
 * admin role". Approvals from here on grant the role (see `decide`); this
 * repairs the ones already approved, the first time the driver opens the app.
 */
export async function getOwn(caller: AuthContext): Promise<{
  profile: DriverProfile | null;
  tokenRefreshRequired: boolean;
}> {
  const profile = await repository.findById(caller.uid);

  if (profile?.status !== 'approved' || caller.role !== 'customer') {
    return { profile, tokenRefreshRequired: false };
  }

  await userService.grantEarnedRole(caller.uid, 'driver');

  // Reported whether or not this call is what changed anything: the token in
  // the driver's hand says customer either way, and one minted after an
  // earlier repair would otherwise stay stale for its full hour.
  return { profile, tokenRefreshRequired: true };
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

/**
 * The review queue, with a person attached to each application.
 *
 * One batch read for the lot rather than one per row: the queue is small, but
 * a read per application is the kind of thing that is fine until the day it
 * is not.
 */
export async function listForReview(options: {
  status?: VerificationStatus;
}): Promise<DriverApplication[]> {
  const applications = await repository.list(options);

  const accounts = await userRepository.findMany(
    applications.map((application) => application.id),
  );

  return applications.map((application) => {
    const account = accounts.get(application.id);

    return {
      ...application,
      account: account
        ? {
            displayName: account.displayName,
            email: account.email,
            phone: account.phone,
            status: account.status,
            role: account.role,
          }
        : null,
    };
  });
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

  // Approval is what makes an account a driver. Without this the delivery
  // routes keep refusing them for not having the role - which is how an
  // approved driver ends up unable to accept a single order.
  //
  // A refusal does not take the role back. `assertApproved` already stops
  // them claiming anything, and stripping the role would break the delivery
  // they may be in the middle of.
  if (status === 'approved') {
    await userService.grantEarnedRole(driverId, 'driver');
  }

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
