'use client';

// What admins have done.
//
// Until this existed, the only record of a decision was the decision itself:
// a kitchen knew who verified it, a suspended account knew who suspended it,
// and a cancelled order knew nothing at all. Nobody could answer "what
// happened on the platform yesterday", and a second operator had no way to
// see what the first had done.
//
// Read-only, because that is the point. There is no endpoint that writes one
// of these by hand and none that edits or deletes one - a log somebody can
// tidy up is evidence of nothing.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileClock, RefreshCw } from 'lucide-react';

import {
  fetchAuditLog,
  type AuditAction,
  type AuditEntry,
} from '../../../services/adminApi';

/** Every action, in the words an operator would use. */
const ACTION_LABELS: Record<AuditAction, string> = {
  'store.approved': 'approved the kitchen',
  'store.rejected': 'turned down the kitchen',
  'driver.approved': 'approved the driver',
  'driver.rejected': 'turned down the driver',
  'user.role_changed': 'changed the role of',
  'user.suspended': 'suspended',
  'user.reinstated': 'let back in',
  'user.removed': 'removed',
  'order.cancelled': 'cancelled the order',
  'cash.dispute_resolved': 'ruled on the cash dispute for',
  'wallet.credited': 'paid money to',
};

/** The filters worth offering: the decisions people ask questions about. */
const FILTERS: Array<{ label: string; action?: AuditAction }> = [
  { label: 'Everything' },
  { label: 'Kitchens approved', action: 'store.approved' },
  { label: 'Kitchens turned down', action: 'store.rejected' },
  { label: 'Drivers approved', action: 'driver.approved' },
  { label: 'Suspensions', action: 'user.suspended' },
  { label: 'Removals', action: 'user.removed' },
  { label: 'Cancellations', action: 'order.cancelled' },
  { label: 'Cash disputes', action: 'cash.dispute_resolved' },
  { label: 'Money paid out', action: 'wallet.credited' },
];

const TONE: Partial<Record<AuditAction, string>> = {
  'store.approved': 'bg-green-100 text-green-900',
  'driver.approved': 'bg-green-100 text-green-900',
  'user.reinstated': 'bg-green-100 text-green-900',
  'store.rejected': 'bg-red-100 text-red-900',
  'driver.rejected': 'bg-red-100 text-red-900',
  'user.suspended': 'bg-red-100 text-red-900',
  'user.removed': 'bg-red-100 text-red-900',
  'order.cancelled': 'bg-amber-100 text-amber-900',
  'cash.dispute_resolved': 'bg-amber-100 text-amber-900',
  'wallet.credited': 'bg-blue-100 text-blue-900',
};

function when(iso: string | null): string {
  if (!iso) return 'at an unrecorded time';

  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'at an unrecorded time';

  // Minutes and hours for today's decisions, the date for older ones: an
  // operator reading this wants "20 minutes ago" or "last Tuesday", not a
  // timestamp to subtract in their head.
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 20) return `${Math.round(minutes / 60)}h ago`;

  return at.toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AuditView() {
  const searchParams = useSearchParams();
  // Arriving from a kitchen, a driver or a person: everything ever done to
  // them, rather than the whole platform's history.
  const subjectId = searchParams.get('subject') ?? undefined;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState<AuditAction | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const page = await fetchAuditLog({ action, subjectId, limit: 100 });
      setEntries(page.entries);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [action, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileClock className="w-7 h-7" />
              Audit log
            </h1>
            <p className="text-white/70">
              {subjectId
                ? 'Everything admins have done to this one record'
                : 'Every decision an admin has made, newest first'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-6">
            <p className="font-semibold mb-1">Could not load the log</p>
            <p className="font-mono break-all">{error}</p>
          </div>
        ) : null}

        {!subjectId && (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
            {FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={() => setAction(filter.action)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  action === filter.action
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}

        {isLoading && entries.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-16 bg-white rounded-xl border border-gray-200 animate-pulse"
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="font-semibold text-gray-700 mb-1">Nothing recorded yet</p>
            <p className="text-sm text-gray-500">
              Approvals, suspensions, cancellations and money paid out by hand
              all appear here as they happen.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="font-semibold text-gray-900">
                    {entry.actorName}{' '}
                    <span className="font-normal text-gray-600">
                      {ACTION_LABELS[entry.action]}
                    </span>{' '}
                    {entry.subjectName || entry.subjectId}
                    {entry.amount !== null && (
                      <span className="font-normal text-gray-600">
                        {' '}
                        — R{entry.amount.toLocaleString()}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        TONE[entry.action] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {entry.action}
                    </span>
                    <span className="text-sm text-gray-500">
                      {when(entry.createdAt)}
                    </span>
                  </div>
                </div>

                {entry.reason && (
                  <p className="mt-2 text-sm text-gray-700 italic">
                    “{entry.reason}”
                  </p>
                )}

                {Object.keys(entry.facts).length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {Object.entries(entry.facts)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AdminAuditPage() {
  // useSearchParams needs a Suspense boundary, or a production build of this
  // page fails outright — the dev server never shows that.
  return (
    <Suspense
      fallback={<div className="p-8 text-center text-gray-400">Loading the log…</div>}
    >
      <AuditView />
    </Suspense>
  );
}
