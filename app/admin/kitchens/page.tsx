'use client';

// Admin / Kitchens
// Who has asked to sell food, and the decision that lets them.
//
// A kitchen used to be on the platform the moment somebody filled in a form.
// Nobody checked that the business existed, that the address was real, or
// that a person had looked at it — while a driver carrying one of its orders
// had been reviewed since October. This is the other half of that gate.
//
// Nothing here is cosmetic: until a kitchen is approved it is not listed, it
// cannot be ordered from, and its own open switch is refused. Turning one
// down closes it in the same write, so a kitchen that was cooking when the
// decision came stops at once.
//
// A refusal has to say why. The vendor is shown those words when they next
// try to open, and a refusal that says nothing is a registration they will
// send again unchanged.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  MapPin,
  Phone,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import RoleGuard from '../../../components/RoleGuard';
import { ApiError } from '../../../services/apiClient';
import {
  decideStore,
  fetchStoresForReview,
  type ReviewStore,
  type StoreVerificationStatus,
} from '../../../services/adminApi';

const STATUS_STYLE: Record<StoreVerificationStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

/**
 * A date an operator can act on, or an honest blank.
 *
 * A kitchen with no timestamp registered before the queue existed, which is
 * worth seeing rather than papering over with "just now".
 */
function formatWhen(iso: string | null): string {
  if (!iso) return 'at an unrecorded time';

  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return 'at an unrecorded time';

  return `on ${when.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

type Filter = StoreVerificationStatus | 'all';

export default function AdminKitchensPage() {
  const [stores, setStores] = useState<ReviewStore[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetchStoresForReview(filter === 'all' ? undefined : filter)
        .then((data) => {
          setStores(data);
          setErrorMessage(null);
        })
        .catch((error: unknown) => {
          setErrorMessage(
            error instanceof ApiError
              ? error.message
              : 'Could not load kitchens.',
          );
        })
        .finally(() => setIsLoading(false)),
    [filter],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchStoresForReview(filter === 'all' ? undefined : filter)
      .then((data) => {
        if (cancelled) return;
        setStores(data);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          error instanceof ApiError ? error.message : 'Could not load kitchens.',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filter]);

  async function decide(store: ReviewStore, decision: 'approve' | 'reject') {
    if (typeof window === 'undefined') return;
    let reason: string | undefined;

    if (decision === 'reject') {
      const answer = window.prompt(
        `Why is ${store.name} being turned down? They are shown this.`,
      );
      if (answer === null) return;
      if (answer.trim().length < 5) {
        toast.error('Say why, so they can fix it.');
        return;
      }
      reason = answer.trim();
    } else if (
      !window.confirm(
        `Approve ${store.name}?\n\nThey can open and start taking orders straight away.`,
      )
    ) {
      return;
    }

    setBusyId(store.id);
    try {
      await decideStore(store.id, decision, reason);
      toast.success(
        decision === 'approve'
          ? 'Approved. They can open whenever they are ready.'
          : 'Turned down, and closed. They have been told why.',
      );
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not save that.',
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm">
          <div className="container mx-auto max-w-5xl px-4 py-6">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to admin
            </Link>
            <h1 className="text-3xl font-bold">Kitchens</h1>
            <p className="text-gray-600 mt-1">
              Nobody sells food on LokshinEats until their kitchen is approved.
            </p>
          </div>
        </div>

        <div className="container mx-auto max-w-5xl px-4 py-8">
          <div className="flex gap-2 mb-6">
            {(['pending', 'approved', 'rejected', 'all'] as const).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setFilter(option);
                    setIsLoading(true);
                  }}
                  className={`px-4 py-2 rounded-xl font-semibold capitalize ${
                    filter === option
                      ? 'bg-primary text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {option}
                </button>
              ),
            )}
          </div>

          {isLoading ? (
            <p className="text-gray-600">Loading…</p>
          ) : errorMessage ? (
            <div className="bg-white rounded-2xl shadow-md p-6">
              <p className="text-red-600 font-semibold mb-2">
                Could not load kitchens
              </p>
              <p className="text-gray-600 text-sm">{errorMessage}</p>
            </div>
          ) : stores.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-md p-10 text-center">
              <Clock className="w-10 h-10 mx-auto text-gray-400 mb-3" />
              <p className="text-lg font-semibold">
                {filter === 'pending' ? 'Nobody is waiting' : 'Nothing to show'}
              </p>
              <p className="text-gray-600 mt-1">
                {filter === 'pending'
                  ? 'New kitchens land here as they register.'
                  : 'Try another filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {stores.map((store) => (
                <div
                  key={store.id}
                  className="bg-white rounded-2xl shadow-md p-6"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <StoreIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-lg">{store.name}</p>
                        <p className="text-sm text-gray-600">
                          {store.cuisine}
                          {store.description ? ` · ${store.description}` : ''}
                        </p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          {store.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {store.isOpen && (
                        <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800">
                          Open
                        </span>
                      )}
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${
                          STATUS_STYLE[store.verification]
                        }`}
                      >
                        {store.verification}
                      </span>
                    </div>
                  </div>

                  <dl className="grid sm:grid-cols-3 gap-4 mt-6">
                    <div>
                      <dt className="text-sm text-gray-600 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> Where
                      </dt>
                      <dd className="font-semibold">
                        {store.address}, {store.city}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" /> Contact
                      </dt>
                      <dd className="font-semibold">
                        {store.phone ?? '—'}
                        {store.email ? (
                          <span className="block text-sm font-normal text-gray-600">
                            {store.email}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Hours
                      </dt>
                      <dd className="font-semibold">
                        {store.openingTime && store.closingTime
                          ? `${store.openingTime} – ${store.closingTime}`
                          : 'Not given'}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 text-sm text-gray-500">
                    {store.verification === 'pending'
                      ? `Registered ${formatWhen(store.createdAt)}, still waiting`
                      : `${
                          store.verification === 'approved'
                            ? 'Approved'
                            : 'Turned down'
                        } ${formatWhen(store.verifiedAt)}${
                          store.verifiedBy
                            ? ` by ${store.verifiedBy}`
                            : ' — no admin recorded'
                        }`}
                  </p>

                  {store.verificationReason && (
                    <p className="mt-4 text-sm text-gray-700 bg-gray-50 rounded-xl p-3">
                      <span className="font-semibold">Reason given: </span>
                      {store.verificationReason}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 mt-6">
                    {store.verification !== 'approved' && (
                      <button
                        type="button"
                        disabled={busyId === store.id}
                        onClick={() => decide(store, 'approve')}
                        className="flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                    )}
                    {store.verification !== 'rejected' && (
                      <button
                        type="button"
                        disabled={busyId === store.id}
                        onClick={() => decide(store, 'reject')}
                        className="flex items-center gap-2 border border-red-300 text-red-600 px-5 py-3 rounded-xl font-semibold hover:bg-red-50 disabled:opacity-60"
                      >
                        <X className="w-4 h-4" />
                        {store.verification === 'approved'
                          ? 'Take it off the platform'
                          : 'Turn down'}
                      </button>
                    )}
                    <Link
                      href={`/admin/users?search=${encodeURIComponent(store.ownerId)}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      The owner&rsquo;s account
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 mt-6">
            A kitchen that registered before November 2026 counts as approved:
            it has been trading for weeks, and reading its missing record as
            &ldquo;pending&rdquo; would close it. Taking an approved kitchen
            off the platform closes it immediately.
          </p>
        </div>
      </div>
    </RoleGuard>
  );
}
