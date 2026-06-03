'use client';

// Earnings and Analytics Page for Store Owners
// Real revenue + delivery counts derived from delivered orders.
// Metrics we don't have data for (acceptance rate, on-time delivery, peak hours,
// repeat customers) are intentionally omitted — better than fake constants.

import RoleGuard from '../../../components/RoleGuard';

import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  ArrowLeft,
  Calendar,
  Package,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useVendorStore } from '../../../hooks/useVendorStore';
import { readVendorPayout } from '../../../services/economics';

// ---------------------------------------------------------------------------
// Types

type DeliveredOrder = {
  id: string;
  /** What customer paid (food + delivery). */
  total: number;
  /** Vendor's actual take after platform commission. */
  vendorPayout: number;
  items: { name: string; quantity: number; price: number }[];
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
  const today = startOfDay(new Date());
  return d >= today;
}
function isWithinDays(d: Date, days: number) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d >= cutoff;
}

// ---------------------------------------------------------------------------

export default function EarningsPage() {
  const { store, isLoading: isStoreLoading, error: storeError } = useVendorStore();

  const [orders, setOrders] = useState<DeliveredOrder[]>([]);
  const [areOrdersLoading, setAreOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('month');

  useEffect(() => {
    if (!store) {
      setOrders([]);
      setAreOrdersLoading(false);
      return;
    }

    let cancelled = false;
    setAreOrdersLoading(true);
    setOrdersError(null);

    (async () => {
      try {
        // Fetch delivered orders for this store. Uses the same (storeId,
        // createdAt) pattern the dashboard already indexes — actually we don't
        // need the orderBy here, but Firestore won't require an extra index
        // since we're filtering equality on storeId only and adding status
        // equality. Composite (storeId, status) is needed; Firestore will
        // prompt for it if missing.
        const snapshot = await getDocs(
          query(
            collection(db, 'orders'),
            where('storeId', '==', store.id),
            where('status', '==', 'delivered'),
          ),
        );
        const rows: DeliveredOrder[] = snapshot.docs.map((d) => {
          const data = d.data();
          const created =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : data.createdAt?.toDate?.() ?? new Date();
          const items = Array.isArray(data.items)
            ? data.items.map((it: any) => ({
                name: it.product?.name ?? 'Item',
                quantity: typeof it.quantity === 'number' ? it.quantity : 1,
                price: typeof it.product?.price === 'number' ? it.product.price : 0,
              }))
            : [];
          return {
            id: d.id,
            total: typeof data.total === 'number' ? data.total : 0,
            vendorPayout: readVendorPayout(data),
            items,
            createdAt: created,
          };
        });
        if (!cancelled) {
          setOrders(rows);
          setAreOrdersLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setOrdersError(err instanceof Error ? err.message : String(err));
          setAreOrdersLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [store]);

  // ---- Derived numbers ----------------------------------------------------

  const stats = useMemo(() => {
    const todayOrders = orders.filter((o) => isToday(o.createdAt));
    const weekOrders = orders.filter((o) => isWithinDays(o.createdAt, 7));
    const monthOrders = orders.filter((o) => isWithinDays(o.createdAt, 30));
    // Sum vendor's actual take (post-commission), not gross order total.
    const sum = (arr: DeliveredOrder[]) => arr.reduce((s, o) => s + o.vendorPayout, 0);
    const totalRevenue = sum(orders);
    const totalOrders = orders.length;
    return {
      totalRevenue,
      totalOrders,
      todayRevenue: sum(todayOrders),
      todayOrders: todayOrders.length,
      weekRevenue: sum(weekOrders),
      weekOrders: weekOrders.length,
      monthRevenue: sum(monthOrders),
      monthOrders: monthOrders.length,
      averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    };
  }, [orders]);

  const periodRevenue =
    selectedPeriod === 'today'
      ? stats.todayRevenue
      : selectedPeriod === 'week'
      ? stats.weekRevenue
      : stats.monthRevenue;

  const periodOrders =
    selectedPeriod === 'today'
      ? stats.todayOrders
      : selectedPeriod === 'week'
      ? stats.weekOrders
      : stats.monthOrders;

  // Top products: aggregate item counts + revenue across delivered orders.
  const topProducts = useMemo(() => {
    const acc = new Map<string, { name: string; orders: number; revenue: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.name;
        const prev = acc.get(key) ?? { name: item.name, orders: 0, revenue: 0 };
        prev.orders += item.quantity;
        prev.revenue += item.price * item.quantity;
        acc.set(key, prev);
      }
    }
    return Array.from(acc.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [orders]);

  // Last-7-days revenue series for the bar chart.
  const dailyRevenue = useMemo(() => {
    const days: { label: string; date: Date; revenue: number }[] = [];
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
      days.push({ label: dayLabels[d.getDay()], date: d, revenue: 0 });
    }
    for (const order of orders) {
      const day = startOfDay(order.createdAt);
      const bucket = days.find((d) => d.date.getTime() === day.getTime());
      if (bucket) bucket.revenue += order.vendorPayout;
    }
    return days;
  }, [orders]);

  const maxRevenue = Math.max(1, ...dailyRevenue.map((d) => d.revenue));

  // ---- Render branches ----------------------------------------------------

  if (isStoreLoading) {
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <PageSkeleton />
      </RoleGuard>
    );
  }

  if (storeError) {
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <ErrorState message={storeError} />
      </RoleGuard>
    );
  }

  if (!store) {
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Set up your store first</h1>
            <p className="text-gray-600 mb-6">
              You need a registered store before you can view earnings.
            </p>
            <Link
              href="/vendor/register"
              className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
            >
              Register your store
            </Link>
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['vendor']}>
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <Link
            href="/vendor/dashboard"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>

          <h1 className="text-3xl font-bold mb-1">Earnings & Analytics</h1>
          <p className="text-sm text-gray-500 mb-6">{store.name}</p>

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

          {areOrdersLoading ? (
            <StatsSkeleton />
          ) : ordersError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-6">
              <p className="font-semibold mb-1">Could not load earnings</p>
              <p className="font-mono break-all">{ordersError}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">No earnings yet</h2>
              <p className="text-gray-600">
                Once orders are delivered, your revenue will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Revenue Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-primary to-primary-dark text-white rounded-xl shadow-md p-6"
                >
                  <DollarSign className="w-6 h-6 opacity-80 mb-2" />
                  <p className="text-3xl font-bold">R{periodRevenue.toLocaleString()}</p>
                  <p className="text-sm opacity-80 capitalize">Revenue · {selectedPeriod}</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <ShoppingBag className="w-6 h-6 text-primary mb-2" />
                  <p className="text-3xl font-bold">{periodOrders}</p>
                  <p className="text-sm text-gray-600 capitalize">Orders · {selectedPeriod}</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <TrendingUp className="w-6 h-6 text-primary mb-2" />
                  <p className="text-3xl font-bold">R{stats.averageOrderValue}</p>
                  <p className="text-sm text-gray-600">Avg Order Value</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <Package className="w-6 h-6 text-primary mb-2" />
                  <p className="text-3xl font-bold">{stats.totalOrders}</p>
                  <p className="text-sm text-gray-600">All-time Deliveries</p>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Revenue Chart */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <h2 className="text-xl font-bold mb-4">Last 7 days</h2>
                  <div className="flex items-end justify-between h-48 gap-2">
                    {dailyRevenue.map((day) => (
                      <div key={day.date.toISOString()} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-primary rounded-t-lg transition-all hover:bg-primary-dark min-h-[2px]"
                          style={{ height: `${(day.revenue / maxRevenue) * 100}%` }}
                        />
                        <p className="text-xs text-gray-600 mt-2">{day.label}</p>
                        <p className="text-xs font-semibold">R{day.revenue}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Top Products */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <h2 className="text-xl font-bold mb-4">Top Products</h2>
                  {topProducts.length === 0 ? (
                    <p className="text-gray-500 text-sm">No products sold yet</p>
                  ) : (
                    <div className="space-y-3">
                      {topProducts.map((product, index) => (
                        <div
                          key={product.name}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold text-primary">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-semibold">{product.name}</p>
                              <p className="text-sm text-gray-600">{product.orders} sold</p>
                            </div>
                          </div>
                          <span className="font-bold">R{product.revenue}</span>
                        </div>
                      ))}
                    </div>
                  )}
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

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <p className="text-red-600 font-semibold mb-2">Could not load your store</p>
        <p className="text-gray-500 text-sm font-mono break-all">{message}</p>
      </div>
    </div>
  );
}
