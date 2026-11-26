/**
 * The audit log's storage: append, and read back newest first.
 *
 * Append-only by construction - nothing here updates or deletes an entry, and
 * the collection matches no security rule, so no client can reach it at all.
 * An audit trail somebody can edit is not evidence of anything.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../../config/firebase';
import { buildPage, type Page } from '../../lib/pagination';
import {
  toAuditEntry,
  type AuditEntry,
  type ListAuditQuery,
  type NewAuditEntry,
} from './audit.model';

const entries = () => db.collection(Collections.auditLog);

export async function append(entry: NewAuditEntry): Promise<string> {
  const reference = entries().doc();

  await reference.set({
    action: entry.action,
    actorId: entry.actorId,
    actorName: entry.actorName,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    subjectName: entry.subjectName,
    reason: entry.reason ?? null,
    amount: entry.amount ?? null,
    facts: entry.facts ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });

  return reference.id;
}

/**
 * The log, newest first.
 *
 * Each filter is an equality on one field beside the ordering, which needs a
 * composite index - declared in `firebase/firestore.indexes.json`. The
 * emulator does not enforce indexes, so a missing one passes every test here
 * and fails only in production.
 */
export async function list(query: ListAuditQuery): Promise<Page<AuditEntry>> {
  let firestoreQuery = entries().orderBy('createdAt', 'desc');

  if (query.action) {
    firestoreQuery = firestoreQuery.where('action', '==', query.action);
  }
  if (query.actorId) {
    firestoreQuery = firestoreQuery.where('actorId', '==', query.actorId);
  }
  if (query.subjectId) {
    firestoreQuery = firestoreQuery.where('subjectId', '==', query.subjectId);
  }

  if (query.cursor) {
    const after = await entries().doc(query.cursor).get();
    if (after.exists) firestoreQuery = firestoreQuery.startAfter(after);
  }

  const snapshot = await firestoreQuery.limit(query.limit + 1).get();

  return buildPage(snapshot.docs.map(toAuditEntry), query.limit);
}
