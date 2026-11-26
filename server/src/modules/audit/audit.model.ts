/**
 * What an admin did, and to whom.
 *
 * Until now the only record of an admin's decision was the decision itself:
 * a kitchen said `verifiedBy`, a suspended account said who suspended it,
 * and a cancelled order said nothing at all about which admin cancelled it or
 * why. Nothing could answer "what happened on the platform yesterday", and a
 * second operator had no way to see what the first had done.
 *
 * Every entry names a person, not an id: `actorName` and `subjectName` are
 * read at the time and stored, so an entry still reads properly after the
 * account it refers to is removed. An audit log that goes blank when somebody
 * leaves is no audit log.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { toIso, toNumber, toStringOr } from '../../lib/serialize';

/**
 * Every admin action worth recording.
 *
 * Named `subject.verb` so the list reads as a sentence and so a filter on
 * one subject's history is a prefix away.
 */
export const AUDIT_ACTIONS = [
  'store.approved',
  'store.rejected',
  'driver.approved',
  'driver.rejected',
  'user.role_changed',
  'user.suspended',
  'user.reinstated',
  'user.removed',
  'order.cancelled',
  'cash.dispute_resolved',
  'wallet.credited',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_SUBJECTS = ['store', 'driver', 'user', 'order'] as const;
export type AuditSubject = (typeof AUDIT_SUBJECTS)[number];

export type AuditEntry = {
  id: string;
  action: AuditAction;
  /** The admin who did it. */
  actorId: string;
  actorName: string;
  subjectType: AuditSubject;
  subjectId: string;
  /** The kitchen, the person, or the order's own reference. */
  subjectName: string;
  /** In the admin's own words, where they gave one. */
  reason: string | null;
  /** Rands, where the action moved money. */
  amount: number | null;
  /** Anything else worth keeping: a role before and after, an outcome. */
  facts: Record<string, string>;
  createdAt: string | null;
};

/** What a caller hands the audit service. The rest is filled in here. */
export type NewAuditEntry = {
  action: AuditAction;
  actorId: string;
  actorName: string;
  subjectType: AuditSubject;
  subjectId: string;
  subjectName: string;
  reason?: string | null;
  amount?: number | null;
  facts?: Record<string, string>;
};

export const listAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(200).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  /** One admin's history. */
  actorId: z.string().trim().min(1).max(128).optional(),
  /** Everything ever done to one kitchen, person or order. */
  subjectId: z.string().trim().min(1).max(128).optional(),
});

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

function action(value: unknown): AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value as string)
    ? (value as AuditAction)
    : 'order.cancelled';
}

function subject(value: unknown): AuditSubject {
  return (AUDIT_SUBJECTS as readonly string[]).includes(value as string)
    ? (value as AuditSubject)
    : 'order';
}

/** Firestore document -> API representation. */
export function toAuditEntry(snapshot: DocumentSnapshot): AuditEntry {
  const data = snapshot.data() ?? {};

  const facts: Record<string, string> = {};
  if (data.facts && typeof data.facts === 'object') {
    for (const [key, value] of Object.entries(
      data.facts as Record<string, unknown>,
    )) {
      if (typeof value === 'string') facts[key] = value;
    }
  }

  return {
    id: snapshot.id,
    action: action(data.action),
    actorId: toStringOr(data.actorId),
    actorName: toStringOr(data.actorName, 'An admin'),
    subjectType: subject(data.subjectType),
    subjectId: toStringOr(data.subjectId),
    subjectName: toStringOr(data.subjectName),
    reason:
      typeof data.reason === 'string' && data.reason ? data.reason : null,
    amount: typeof data.amount === 'number' ? toNumber(data.amount) : null,
    facts,
    createdAt: toIso(data.createdAt),
  };
}
