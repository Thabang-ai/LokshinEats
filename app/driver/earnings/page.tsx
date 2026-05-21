'use client';

// Driver Earnings Page
// Real earnings derived from delivered orders for this driver.
// Metrics we don't track yet (on-time rate, avg delivery time, peak hours,
// rating) are intentionally omitted rather than faked.

import RoleGuard from '../../../components/RoleGuard';

import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Package,
  ArrowLeft,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuthUser } from '../../../hooks/useAuthUser';

// ---------------------------------------------------------------------------
// Types

type DeliveredOrder = {
  id: string;
  storeName: string;
  customerName: string;
  deliveryFee: number;
  actualDeliveryTime: Date;
  createdAt: Date;
};

type Period = 'today' | 'week' | 'month';

// ---------------------------------------------------------------------------
// Date helpers

function startOfDay(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
function isToday(d: Date) {
  return d >= startOfDay(new Date());
}
function isWithinDays(d: Date, days: number) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d >= cutoff;
}
function tsToDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v.toDate === 'function') return v.toDate();
  return null;
}
function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

// ---------------------------------------------------------------------------

export default function DriverEarningsPage() {
  const { user, authReady } = useAuthUser();

  const [orders, setOrders] = useState<DeliveredOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('month');

  // Fetch delivered orders for this driver. Reuses the (driverId, status, ...)
  // composite index created for the driver dashboard — no new index needed.
  useEffect(() => {
    if (!user) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    (async () => {
      try {
        const snapshot = await getDocs(
          query(
            collection(db, 'orders'),
            where('driverId', '==', user.uid),
            where('status', '==', 'delivered'),
          ),
        );
        const rows: DeliveredOrder[] = snapshot.docs.map((d) => {
          const data = d.data();
          const created = tsToDate(data.createdAt) ?? new Date();
          // Fall back to createdAt if actualDeliveryTime is missing
          const delivered = tsToDate(data.actualDeliveryTime) ?? created;
          return {
            id: d.id,
            storeName: data.storeName ?? 'Unknown store',
            customerName: data.customerName ?? 'Customer',
            deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
            actualDeliveryTime: delivered,
            createdAt: created,
          };
        });
        rows.sort((a, b) => b.actualDeliveryTime.getTime() - a.actualDeliveryTime.getTime());
        if (!cancelled) {
          setOrders(rows);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---- Derived numbers ----------------------------------------------------

  const stats = useMemo(() => {
    const today = orders.filter((o) => isToday(o.actualDeliveryTime));
    const week = orders.filter((o) => isWithinDays(o.actualDeliveryTime, 7));
    const month = orders.filter((o) => isWithinDays(o.actualDeliveryTime, 30));
    const sum = (arr: DeliveredOrder[]) => arr.reduce((s, o) => s + o.deliveryFee, 0);
    return {
      totalEarnings: sum(orders),
      totalDeliveries: orders.length,
      todayEarnings: sum(today),
      todayDeliveries: today.length,
      weekEarnings: sum(week),
      weekDeliveries: week.length,
      monthEarnings: sum(month),
      monthDeliveries: month.length,
      averagePerDelivery:
        orders.length > 0 ? Math.round(sum(orders) / orders.length) : 0,
    };
  }, [orders]);

  const periodEarnings =
    selectedPeriod === 'today'
      ? stats.todayEarnings
      : selectedPeriod === 'week'
      ? stats.weekEarnings
      : stats.monthEarnings;

  const periodDeliveries =
    selectedPeriod === 'today'
      ? stats.todayDeliveries
      : selectedPeriod === 'week'
      ? stats.weekDeliveries
      : stats.monthDeliveries;

  // Last-7-days earnings series for the bar chart.
  const dailyEarnings = useMemo(() => {
    const days: { label: string; date: Date; earnings: number }[] = [];
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
      days.push({ label: dayLabels[d.getDay()], date: d, earnings: 0 });
    }
    for (const order of orders) {
      const day = startOfDay(order.actualDeliveryTime);
      const bucket = days.find((d) => d.date.getTime() === day.getTime());
      if (bucket) bucket.earnings += order.deliveryFee;
    }
    return days;
  }, [orders]);

  const maxEarnings = Math.max(1, ...dailyEarnings.map((d) => d.earnings));

  // ---- Render branches ----------------------------------------------------

  if (!authReady) {
    return (
      <RoleGuard allowedRoles={['driver']}>
        <PageSkeleton />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['driver']}>
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <Link
            href="/driver/dashboard"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>

          <h1 className="text-3xl font-bold mb-6">Earnings & Performance</h1>

          {/* Period Selector */}
          <div className="bg-white rounded-xl shadow-md p-4 mb-6">
            <div className="flex items-center gap-4">
              <Calendar className="w-5 h-5 text-gray-400" />
              <div className="flex gap-2">
                {(['today', 'week', 'month'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedPeriod(period)}
                    className={`px-4 py-2 rounded-lg font-semibold capitalize transition-colors ${
                      selectedPeriod === period
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {period === 'week' ? 'Last 7 days' : period === 'month' ? 'Last 30 days' : 'Today'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <StatsSkeleton />
          ) : errorMessage ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-6">
              <p className="font-semibold mb-1">Could not load earnings</p>
              <p className="font-mono break-all">{errorMessage}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">No earnings yet</h2>
              <p className="text-gray-600 mb-6">
                Complete your first delivery to start earning.
              </p>
              <Link
                href="/driver/dashboard"
                className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
              >
                Find a delivery
              </Link>
            </div>
          ) : (
            <>
              {/* Earnings Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-primary to-primary-dark text-white rounded-xl shadow-md p-6"
                >
                  <DollarSign className="w-6 h-6 opacity-80 mb-2" />
                  <p className="text-3xl font-bold">R{periodEarnings.toLocaleString()}</p>
                  <p className="text-sm opacity-80 capitalize">Earnings · {selectedPeriod}</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <Package className="w-6 h-6 text-primary mb-2" />
                  <p className="text-3xl font-bold">{periodDeliveries}</p>
                  <p className="text-sm text-gray-600 capitalize">Deliveries · {selectedPeriod}</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <TrendingUp className="w-6 h-6 text-primary mb-2" />
                  <p className="text-3xl font-bold">R{stats.averagePerDelivery}</p>
                  <p className="text-sm text-gray-600">Per Delivery</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <Package className="w-6 h-6 text-primary mb-2" />
                  <p className="text-3xl font-bold">{stats.totalDeliveries}</p>
                  <p className="text-sm text-gray-600">All-time</p>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Earnings Chart */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <h2 className="text-xl font-bold mb-4">Last 7 days</h2>
                  <div className="flex items-end justify-between h-48 gap-2">
                    {dailyEarnings.map((day) => (
                      <div key={day.date.toISOString()} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-primary rounded-t-lg transition-all hover:bg-primary-dark min-h-[2px]"
                          style={{ height: `${(day.earnings / maxEarnings) * 100}%` }}
                        />
                        <p className="text-xs text-gray-600 mt-2">{day.label}</p>
                        <p className="text-xs font-semibold">R{day.earnings}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Recent Deliveries */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <h2 className="text-xl font-bold mb-4">Recent Deliveries</h2>
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{order.storeName}</p>
                            <p className="text-sm text-gray-600 truncate">
                              For {order.customerName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="font-bold text-green-600">+R{order.deliveryFee}</p>
                          <p className="text-xs text-gray-500">{relativeTime(order.actualDeliveryTime)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}

// ---------------------------------------------------------------------------
// Sub-components

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-md p-6 animate-pulse">
          <div className="h-6 w-6 bg-gray-200 rounded mb-3" />
          <div className="h-8 bg-gray-200 rounded w-2/3 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="h-4 w-32 bg-gray-200 rounded mb-2 animate-pulse" />
        <div className="h-9 w-64 bg-gray-200 rounded mb-6 animate-pulse" />
        <StatsSkeleton />
      </div>
    </div>
  );
}
