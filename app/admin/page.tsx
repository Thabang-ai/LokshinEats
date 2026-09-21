'use client';

// Admin / Operator Console
// A single live screen for the platform operator (you) to watch the whole
// marketplace during the pilot: every order as it comes in, the money moving
// through the platform, and anything that needs a human to step in.
//
// Everything here comes from the API (see services/adminApi.ts). This screen
// used to hold an onSnapshot listener over the whole orders collection, which
// meant an admin's browser read raw documents — including delivery codes that
// belong only to the customer whose order it is. The API decides what an
// admin may see; this screen only asks.
//
// Read-only except for one action: cancelling an order. That goes through the
// API's cancellation tiers, which decide what the cancellation costs and move
// the money to match. It replaces the old Reset and Delete buttons, which
// wrote to Firestore directly and could leave an order in a state its money
// had already moved past.
//
// The admin role is granted manually on a trusted user doc (Firebase console
// → users/{uid}.role = "admin"); there is no admin self-signup.

import Link from 'next/link';
import RoleGuard from '../../components/RoleGuard';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bike,
  Clock,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ApiError } from '../../services/apiClient';
import {
  cancelOrder,
  fetchAllOrders,
  fetchPlatformWallet,
  previewCancellation,
} from '../../services/adminApi';

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

type AdminOrder = {
  id: string;
  customerName: string;
  storeName: string;
  itemCount: number;
  total: number;
  subtotal: number;
  platformEarnings: number;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  driverId: string | null;
  // Cash reconciliation flags
  cashGivenToVendor: boolean;
  vendorCashConfirmed: boolean;
  vendorCashDisputed: boolean;
  createdAt: Date | null;
};

const statusConfig: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: 'Confirmed', color: 'bg-indigo-100 text-indigo-700' },
  preparing: { label: 'Preparing', color: 'bg-blue-100 text-blue-700' },
  ready: { label: 'Ready', color: 'bg-green-100 text-green-700' },
  picked_up: { label: 'Picked Up', color: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'Delivered', color: 'bg-gray-100 text-gray-700' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
};

// Orders in these statuses are "live" — still moving through the pipeline.
const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'];

// A pending order older than this (minutes) probably needs a nudge.
const STALE_PENDING_MIN = 20;

function isToday(d: Date) {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function minutesSince(d: Date): number {
  return (Date.now() - d.getTime()) / 60000;
}

function relativeTime(d: Date | null): string {
  if (!d) return 'just now';
  const diffMin = Math.round(minutesSince(d));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

function paymentBadge(method: string): { label: string; color: string } {
  switch (method) {
    case 'cash':
      return { label: '💵 Cash', color: 'bg-green-50 text-green-700 border-green-200' };
    case 'yoco':
      return { label: '💳 Yoco', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'ozow':
      return { label: '📱 Ozow', color: 'bg-purple-50 text-purple-700 border-purple-200' };
    default:
      return { label: method, color: 'bg-gray-50 text-gray-700 border-gray-200' };
  }
}

type StatusFilter = OrderStatus | 'all' | 'active';

export default function AdminConsole() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('active');
  // What has actually settled into the platform's wallet, as opposed to what
  // the orders on screen are expected to yield.
  const [platformBalance, setPlatformBalance] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Bumped every 30s so relative times ("5 min ago") and stale-order
  // detection stay fresh even when no new snapshot arrives.
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Polling, not a listener. The API is what decides that an admin may see
  // all of this, and it cannot push — so the console asks every ten seconds,
  // which on a board somebody is watching is indistinguishable from live.
  useEffect(() => {
    let cancelled = false;

    // Skipping a poll while the tab is in the background saves a request and
    // a token refresh. Skipping the FIRST load does not: a console opened in a
    // background tab would sit on its skeleton and still be blank when
    // somebody finally looked at it.
    const load = async ({ poll = false }: { poll?: boolean } = {}) => {
      if (poll && typeof document !== 'undefined' && document.hidden) return;

      try {
        const [page, wallet] = await Promise.all([
          fetchAllOrders({ limit: 100 }),
          // A failure here must not cost the order feed: the balance is the
          // nice-to-have, the feed is the job.
          fetchPlatformWallet().catch(() => null),
        ]);
        if (cancelled) return;

        setOrders(
          page.orders.map((o) => ({
            id: o.id,
            customerName: o.customerName || 'Customer',
            storeName: o.storeName || 'Unknown store',
            itemCount: (o.items ?? []).reduce(
              (sum, item) => sum + (item.quantity ?? 1),
              0,
            ),
            total: o.total,
            subtotal: o.subtotal,
            platformEarnings: o.platformEarnings,
            status: o.status,
            paymentMethod: o.paymentMethod,
            paymentStatus: o.paymentStatus,
            driverId: o.driverId,
            cashGivenToVendor: o.cashGivenToVendor,
            vendorCashConfirmed: o.vendorCashConfirmed,
            vendorCashDisputed: o.vendorCashDisputed,
            createdAt: o.createdAt ? new Date(o.createdAt) : null,
          })),
        );
        setPlatformBalance(wallet ? wallet.availableBalance : null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // Keep whatever is already on screen: a stale feed is more use to an
        // operator than an empty one.
        setError(
          err instanceof ApiError ? err.message : 'Could not reach the API.',
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    const interval = setInterval(() => void load({ poll: true }), 10000);

    // Coming back to the tab should not mean waiting out the interval: what
    // changed while it was hidden is exactly what the operator came back to
    // look at.
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshKey]);

  // ---- The one action: cancel ---------------------------------------------
  // What a cancellation costs depends on how far the order got, so the
  // operator is shown the figures the API worked out and cancels at those or
  // not at all. Goodwill is the part the platform absorbs to make it balance.
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleCancelOrder = async (orderId: string, label: string) => {
    if (typeof window === 'undefined') return;
    setBusyId(orderId);

    try {
      const preview = await previewCancellation(orderId);

      if (!preview.allowed || !preview.stage) {
        toast.error(preview.reason ?? 'This order cannot be cancelled.');
        return;
      }

      const lines = [
        'Cancel ' + label + '?',
        '',
        'Refund to the customer: R' + preview.customerRefund.toFixed(2),
        'Paid to the kitchen: R' + preview.vendorPay.toFixed(2),
        'Paid to the driver: R' + preview.driverPay.toFixed(2),
      ];
      if (preview.goodwill && preview.goodwill > 0) {
        lines.push(
          '',
          'LokshinEats absorbs R' + preview.goodwill.toFixed(2) + ' of this.',
        );
      }

      if (!window.confirm(lines.join(String.fromCharCode(10)))) return;

      await cancelOrder(orderId, preview.stage);
      toast.success('Order cancelled and settled');
      setRefreshKey((key) => key + 1);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not cancel that order.',
      );
      // Either it moved on, or something else is wrong. Re-read, don't guess.
      setRefreshKey((key) => key + 1);
    } finally {
      setBusyId(null);
    }
  };

  // ---- Derived headline numbers ------------------------------------------
  const stats = useMemo(() => {
    const todays = orders.filter((o) => o.createdAt && isToday(o.createdAt));
    const delivered = orders.filter((o) => o.status === 'delivered');
    const deliveredToday = delivered.filter((o) => o.createdAt && isToday(o.createdAt));
    const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));

    const gmvToday = todays.reduce((sum, o) => sum + o.total, 0);
    // Platform earnings realize on delivery, so count only delivered orders.
    const platformEarningsToday = deliveredToday.reduce((sum, o) => sum + o.platformEarnings, 0);
    const platformEarningsAll = delivered.reduce((sum, o) => sum + o.platformEarnings, 0);

    return {
      ordersToday: todays.length,
      ordersAll: orders.length,
      gmvToday,
      gmvAll: orders.reduce((sum, o) => sum + o.total, 0),
      platformEarningsToday,
      platformEarningsAll,
      activeCount: active.length,
      deliveredAll: delivered.length,
    };
  }, [orders]);

  // ---- Things that need a human ------------------------------------------
  const alerts = useMemo(() => {
    const disputes = orders.filter((o) => o.vendorCashDisputed);
    const unclaimedReady = orders.filter((o) => o.status === 'ready' && !o.driverId);
    const stalePending = orders.filter(
      (o) => o.status === 'pending' && o.createdAt && minutesSince(o.createdAt) > STALE_PENDING_MIN,
    );
    // Cash that's been collected from the customer but not yet confirmed
    // received by the vendor — money "in transit" through a driver.
    const cashInTransit = orders.filter(
      (o) =>
        o.paymentMethod === 'cash' &&
        o.status === 'delivered' &&
        !o.vendorCashConfirmed &&
        !o.vendorCashDisputed,
    );
    return { disputes, unclaimedReady, stalePending, cashInTransit };
  }, [orders]);

  const alertCount =
    alerts.disputes.length + alerts.unclaimedReady.length + alerts.stalePending.length;

  // ---- Filtered feed ------------------------------------------------------
  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'active') return orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length, active: 0 };
    for (const o of orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
      if (ACTIVE_STATUSES.includes(o.status)) counts.active += 1;
    }
    return counts;
  }, [orders]);

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Activity className="w-7 h-7" />
                  Operator Console
                </h1>
                <p className="text-white/70">Live view of every order on the platform</p>
              </div>
              <div className="flex items-center gap-2">
              <Link
                href="/admin/users"
                className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
              >
                <Users className="w-4 h-4" /> People
              </Link>
              <div className="flex items-center gap-2 text-sm bg-white/10 px-3 py-1.5 rounded-full">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                Live
              </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-8">
              <p className="font-semibold mb-1">Could not load orders</p>
              <p className="font-mono break-all">{error}</p>
              <p className="mt-2 text-red-700">
                If this says your account is not permitted, it does not have the
                admin role yet. If it says LokshinEats could not be reached, the
                API is not running or this build points at the wrong one.
              </p>
            </div>
          ) : null}

          {/* KPI cards */}
          {isLoading ? (
            <KpiSkeleton />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiCard
                icon={<ShoppingBag className="w-5 h-5 text-primary" />}
                value={stats.ordersToday}
                label="Orders today"
                sub={`${stats.ordersAll} all-time`}
              />
              <KpiCard
                icon={<TrendingUp className="w-5 h-5 text-primary" />}
                value={`R${stats.gmvToday.toLocaleString()}`}
                label="Sales today (GMV)"
                sub={`R${stats.gmvAll.toLocaleString()} all-time`}
              />
              <KpiCard
                icon={<Wallet className="w-5 h-5 text-primary" />}
                value={`R${stats.platformEarningsToday.toLocaleString()}`}
                label="Your earnings today"
                sub={
                  platformBalance === null
                    ? `R${stats.platformEarningsAll.toLocaleString()} all-time`
                    // What is actually in the platform wallet, which is the
                    // all-time figure minus anything refunded as goodwill.
                    : `R${platformBalance.toLocaleString()} in your wallet`
                }
              />
              <KpiCard
                icon={<Activity className="w-5 h-5 text-primary" />}
                value={stats.activeCount}
                label="Active right now"
                sub={`${stats.deliveredAll} delivered`}
              />
            </div>
          )}

          {/* Alerts — things that need you */}
          {!isLoading && alertCount > 0 && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Needs attention ({alertCount})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <AlertTile
                  icon={<Banknote className="w-4 h-4" />}
                  count={alerts.disputes.length}
                  label="Cash disputes"
                  detail="Vendor says driver didn't hand over cash"
                  tone="red"
                  onClick={() => setFilter('all')}
                />
                <AlertTile
                  icon={<Bike className="w-4 h-4" />}
                  count={alerts.unclaimedReady.length}
                  label="Ready, no driver"
                  detail="Food is ready but no driver claimed it"
                  tone="amber"
                  onClick={() => setFilter('ready')}
                />
                <AlertTile
                  icon={<Clock className="w-4 h-4" />}
                  count={alerts.stalePending.length}
                  label={`Pending > ${STALE_PENDING_MIN}m`}
                  detail="Vendor hasn't confirmed these yet"
                  tone="amber"
                  onClick={() => setFilter('pending')}
                />
              </div>
              {alerts.cashInTransit.length > 0 && (
                <p className="text-sm text-amber-800 mt-3 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4" />
                  {alerts.cashInTransit.length} delivered cash order
                  {alerts.cashInTransit.length === 1 ? '' : 's'} awaiting vendor confirmation
                  (cash in transit).
                </p>
              )}
            </div>
          )}

          {/* Filter chips */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            <FilterChip
              label="Active"
              count={statusCounts.active ?? 0}
              active={filter === 'active'}
              onClick={() => setFilter('active')}
            />
            {(['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'] as OrderStatus[]).map(
              (s) => (
                <FilterChip
                  key={s}
                  label={statusConfig[s].label}
                  count={statusCounts[s] ?? 0}
                  active={filter === s}
                  onClick={() => setFilter(s)}
                />
              ),
            )}
            <FilterChip
              label="All"
              count={statusCounts.all ?? 0}
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
          </div>

          {/* Live order feed */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-gray-400" />
                Order feed
              </h2>
              <span className="text-sm text-gray-500">{filtered.length} shown</span>
            </div>

            {isLoading ? (
              <FeedSkeleton />
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 px-4">
                <PackageCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No orders here</p>
                <p className="text-sm text-gray-400">
                  {orders.length === 0
                    ? 'When customers place orders, they appear here in real time.'
                    : 'Nothing matches this filter right now.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((o) => {
                  const sc = statusConfig[o.status];
                  const pay = paymentBadge(o.paymentMethod);
                  const isStalePending =
                    o.status === 'pending' &&
                    o.createdAt != null &&
                    minutesSince(o.createdAt) > STALE_PENDING_MIN;
                  return (
                    <li
                      key={o.id}
                      className={`px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-gray-50 ${
                        o.vendorCashDisputed ? 'bg-red-50/60' : ''
                      }`}
                    >
                      {/* Status */}
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${sc.color} shrink-0`}
                      >
                        {sc.label}
                      </span>

                      {/* Store → customer */}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">
                          {o.storeName}{' '}
                          <span className="text-gray-400 font-normal">→</span> {o.customerName}
                        </p>
                        <p className="text-xs text-gray-500">
                          #{o.id.slice(0, 6)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'} ·{' '}
                          {relativeTime(o.createdAt)}
                          {isStalePending && (
                            <span className="text-amber-600 font-semibold"> · waiting on vendor</span>
                          )}
                        </p>
                      </div>

                      {/* Payment */}
                      <span
                        className={`px-2 py-0.5 rounded border text-xs font-medium ${pay.color} shrink-0`}
                      >
                        {pay.label}
                      </span>

                      {/* Driver */}
                      <span className="text-xs text-gray-500 w-20 shrink-0 hidden sm:block">
                        {o.driverId ? (
                          <span className="inline-flex items-center gap-1 text-gray-700">
                            <Bike className="w-3.5 h-3.5" /> assigned
                          </span>
                        ) : ACTIVE_STATUSES.includes(o.status) ? (
                          <span className="text-amber-600">no driver</span>
                        ) : (
                          '—'
                        )}
                      </span>

                      {/* Money */}
                      <div className="text-right shrink-0 w-24">
                        <p className="font-bold">R{o.total.toFixed(2)}</p>
                        <p className="text-xs text-green-700">
                          +R{o.platformEarnings.toFixed(2)}
                        </p>
                      </div>

                      {/* The only write this console makes */}
                      <div className="flex items-center gap-1 shrink-0 w-9">
                        {ACTIVE_STATUSES.includes(o.status) && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCancelOrder(
                                o.id,
                                `${o.storeName} → ${o.customerName}`,
                              )
                            }
                            disabled={busyId === o.id}
                            title="Cancel this order — you will be shown what it costs first"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {o.vendorCashDisputed && (
                        <span className="w-full text-xs font-semibold text-red-700 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Cash dispute — driver and vendor
                          disagree on handover
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-4 text-center">
            &quot;+R&quot; is your platform earnings (realized on delivery) · cancelling settles
            the money through the API · Updates every 10s
          </p>
        </div>
      </div>
    </RoleGuard>
  );
}

// ---------------------------------------------------------------------------
// Sub-components

function KpiCard({
  icon,
  value,
  label,
  sub,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-md p-5">
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-600">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function AlertTile({
  icon,
  count,
  label,
  detail,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  detail: string;
  tone: 'red' | 'amber';
  onClick: () => void;
}) {
  const dim = count === 0;
  const toneClasses = dim
    ? 'bg-white border-gray-200 text-gray-400'
    : tone === 'red'
    ? 'bg-red-50 border-red-200 text-red-800'
    : 'bg-amber-100/60 border-amber-300 text-amber-900';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dim}
      className={`text-left rounded-lg border p-3 transition-colors ${toneClasses} ${
        dim ? 'cursor-default' : 'hover:brightness-95'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-2xl font-bold">{count}</span>
      </div>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs opacity-80">{detail}</p>
    </button>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
      }`}
    >
      {label}
      <span className={`ml-1.5 ${active ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
    </button>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-md p-5 animate-pulse">
          <div className="h-5 w-5 bg-gray-200 rounded mb-3" />
          <div className="h-7 bg-gray-200 rounded w-1/2 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <ul className="divide-y divide-gray-100">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
          <div className="h-6 w-16 bg-gray-200 rounded-full" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/4" />
          </div>
          <div className="h-5 w-16 bg-gray-200 rounded" />
        </li>
      ))}
    </ul>
  );
}
