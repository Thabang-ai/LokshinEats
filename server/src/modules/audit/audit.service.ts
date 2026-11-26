/**
 * Recording what an admin did.
 *
 * Two rules hold this together.
 *
 * The first: **recording never fails the action**. Every call is made after
 * the thing itself has already happened - the kitchen is approved, the money
 * has moved - and throwing here would hand the admin an error for work that
 * was done, which they would then do again. A write that fails is shouted
 * about in the API log instead, where a missing entry is visible.
 *
 * The second: **entries carry names, not just ids**, read at the time and
 * stored. An audit log that reads "a1b2c3 suspended d4e5f6" is one nobody
 * can use, and one that goes blank when an account is removed is worse.
 */

import { moduleLogger } from '../../config/logger';
import type { AuthContext } from '../../middleware/auth';
import * as userRepository from '../users/user.repository';
import type {
  AuditEntry,
  ListAuditQuery,
  NewAuditEntry,
} from './audit.model';
import * as repository from './audit.repository';
import type { Page } from '../../lib/pagination';

const log = moduleLogger('audit');

/** Append an entry. Never throws. */
export async function record(entry: NewAuditEntry): Promise<void> {
  try {
    await repository.append(entry);
  } catch (error) {
    log.error(
      {
        error,
        action: entry.action,
        actorId: entry.actorId,
        subjectId: entry.subjectId,
      },
      'Could not write an audit entry. The action itself went through.',
    );
  }
}

/**
 * Append an entry for something an admin did, naming them.
 *
 * The admin's own name is looked up rather than taken from the token, which
 * carries only a uid and an email. One extra read per admin action, on
 * actions a human performs by hand.
 */
export async function recordAdminAction(
  actor: AuthContext,
  entry: Omit<NewAuditEntry, 'actorId' | 'actorName'>,
): Promise<void> {
  let actorName = actor.email ?? 'An admin';

  try {
    const profile = await userRepository.findById(actor.uid);
    if (profile?.displayName) actorName = profile.displayName;
  } catch (error) {
    // A name we could not read is not a reason to lose the entry.
    log.warn({ error, actorId: actor.uid }, 'Could not read the admin name.');
  }

  await record({ ...entry, actorId: actor.uid, actorName });
}

export async function list(query: ListAuditQuery): Promise<Page<AuditEntry>> {
  return repository.list(query);
}
