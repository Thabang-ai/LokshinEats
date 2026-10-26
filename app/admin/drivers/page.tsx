'use client';

// Admin / Drivers
// Who has asked to deliver, what they say they drive, and the decision that
// lets them work.
//
// Nobody delivers until an application here is approved — the API refuses the
// claim — so an untended queue is drivers sitting idle. Pending applications
// come first for that reason.
//
// A refusal has to say why. The driver is shown the reason in their app, and
// one that says nothing is an application they will send again unchanged.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bike, Car, Check, Clock, X } from 'lucide-react';
import toast from 'react-hot-toast';

import RoleGuard from '../../../components/RoleGuard';
import { ApiError } from '../../../services/apiClient';
import {
  decideDriverApplication,
  fetchDriverApplications,
  type DriverApplication,
  type DriverVerificationStatus,
} from '../../../services/adminApi';

const VEHICLE_LABEL: Record<DriverApplication['vehicleType'], string> = {
  bicycle: 'Bicycle',
  motorbike: 'Motorbike',
  car: 'Car',
};

const STATUS_STYLE: Record<DriverVerificationStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

/**
 * A date an operator can act on, or an honest blank.
 *
 * A record with no timestamp is one that did not come through the normal
 * route, which is worth seeing rather than papering over with "just now".
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

function VehicleIcon({ type }: { type: DriverApplication['vehicleType'] }) {
  return type === 'car' ? (
    <Car className="w-5 h-5" />
  ) : (
    <Bike className="w-5 h-5" />
  );
}

export default function AdminDriversPage() {
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [filter, setFilter] = useState<DriverVerificationStatus | 'all'>(
    'pending',
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // State is set in the promise's callbacks rather than in the effect body:
  // setting it synchronously there cascades renders, which React now warns
  // about.
  const load = useCallback(
    () =>
      fetchDriverApplications(filter === 'all' ? undefined : filter)
        .then((data) => {
          setApplications(data);
          setErrorMessage(null);
        })
        .catch((error: unknown) => {
          setErrorMessage(
            error instanceof ApiError
              ? error.message
              : 'Could not load drivers.',
          );
        })
        .finally(() => setIsLoading(false)),
    [filter],
  );

  useEffect(() => {
    let cancelled = false;
    fetchDriverApplications(filter === 'all' ? undefined : filter)
      .then((data) => {
        if (cancelled) return;
        setApplications(data);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          error instanceof ApiError ? error.message : 'Could not load drivers.',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filter]);

  async function decide(
    application: DriverApplication,
    decision: 'approve' | 'reject',
  ) {
    let reason: string | undefined;

    if (decision === 'reject') {
      // Asked for rather than optional: the driver is shown this.
      const answer = window.prompt(
        'Why is this application turned down? The driver is shown this.',
      );
      if (answer === null) return;
      if (answer.trim().length < 3) {
        toast.error('Say why, so the driver can fix it.');
        return;
      }
      reason = answer.trim();
    }

    setBusyId(application.id);
    try {
      await decideDriverApplication(application.id, decision, reason);
      toast.success(
        decision === 'approve'
          ? 'Approved. They can take deliveries now.'
          : 'Turned down. They have been told why.',
      );
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not save that.',
      );
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
            <h1 className="text-3xl font-bold">Drivers</h1>
            <p className="text-gray-600 mt-1">
              Nobody can take a delivery until their application is approved.
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
                Could not load drivers
              </p>
              <p className="text-gray-600 text-sm">{errorMessage}</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-md p-10 text-center">
              <Clock className="w-10 h-10 mx-auto text-gray-400 mb-3" />
              <p className="text-lg font-semibold">
                {filter === 'pending'
                  ? 'Nobody is waiting'
                  : 'Nothing to show'}
              </p>
              <p className="text-gray-600 mt-1">
                {filter === 'pending'
                  ? 'New applications land here as drivers send them.'
                  : 'Try another filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {applications.map((application) => (
                <div
                  key={application.id}
                  className="bg-white rounded-2xl shadow-md p-6"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <VehicleIcon type={application.vehicleType} />
                      </div>
                      <div>
                        <p className="font-bold text-lg">
                          {VEHICLE_LABEL[application.vehicleType]}
                        </p>
                        <p className="text-sm text-gray-600 font-mono">
                          {application.id}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${
                        STATUS_STYLE[application.status]
                      }`}
                    >
                      {application.status}
                    </span>
                  </div>

                  <dl className="grid sm:grid-cols-3 gap-4 mt-6">
                    <div>
                      <dt className="text-sm text-gray-600">Licence</dt>
                      <dd className="font-semibold">
                        {application.licenceNumber ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600">Registration</dt>
                      <dd className="font-semibold">
                        {application.vehicleRegistration ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600">ID / passport</dt>
                      <dd className="font-semibold">{application.idNumber}</dd>
                    </div>
                  </dl>

                  <p className="mt-4 text-sm text-gray-500">
                    {application.status === 'pending'
                      ? `Applied ${formatWhen(application.createdAt)}, still waiting`
                      : `${
                          application.status === 'approved'
                            ? 'Approved'
                            : 'Turned down'
                        } ${formatWhen(application.decidedAt)}${
                          application.decidedBy
                            ? ` by ${application.decidedBy}`
                            : ' — no admin recorded'
                        }`}
                  </p>

                  {application.decisionReason && (
                    <p className="mt-4 text-sm text-gray-700 bg-gray-50 rounded-xl p-3">
                      <span className="font-semibold">Reason given: </span>
                      {application.decisionReason}
                    </p>
                  )}

                  {application.status !== 'approved' && (
                    <div className="flex gap-3 mt-6">
                      <button
                        type="button"
                        disabled={busyId === application.id}
                        onClick={() => decide(application, 'approve')}
                        className="flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      {application.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={busyId === application.id}
                          onClick={() => decide(application, 'reject')}
                          className="flex items-center gap-2 border border-red-300 text-red-600 px-5 py-3 rounded-xl font-semibold hover:bg-red-50 disabled:opacity-60"
                        >
                          <X className="w-4 h-4" />
                          Turn down
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
