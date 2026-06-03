'use client';

// Store Owner Dashboard
// Reads the vendor's store via useVendorStore, then queries orders scoped to that store.

import RoleGuard from '../../../components/RoleGuard';

import { useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag,
  TrendingUp,
  Clock,
  Star,
  Plus,
  Settings,
  LogOut,
  Bell,
  Package,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../../firebase/config';
import { useVendorStore } from '../../../hooks/useVendorStore';
import { readVendorPayout } from '../../../services/economics';

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled';

type VendorOrder = {
  id: string;
  customerName: string;
  items: { name: string; quantity: number }[];
  /** What customer paid (food + delivery). Shown to vendor for context. */
  total: number;
  /** Vendor's actual take after platform commission. */
  vendorPayout: number;
  status: OrderStatus;
  paymentMethod: string;
  subtotal: number;
  // Cash handoff state — driver claims they paid, vendor confirms or disputes.
  cashGivenToVendor: boolean;
  cashGivenAmount: number | null;
  vendorCashConfirmed: boolean;
  vendorCashDisputed: boolean;
  createdAt: Date;
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

function isToday(d: Date) {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
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

export default function VendorDashboard() {
  const router = useRouter();
  const { user, store, isLoading: isStoreLoading, error: storeError } = useVendorStore();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out');
      router.push('/auth/login');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to logout');
    }
  };

  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [areOrdersLoading, setAreOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // Open/closed state — initialized from store, updated optimistically on toggle.
  const [isOpen, setIsOpen] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (store) setIsOpen(store.isOpen);
  }, [store]);

  const handleToggleOpen = async () => {
    if (!store || isToggling) return;
    const next = !isOpen;
    setIsToggling(true);
    setIsOpen(next); // optimistic
    try {
      await updateDoc(doc(db, 'stores', store.id), { isOpen: next });
      toast.success(next ? 'Store opened — accepting orders' : 'Store closed');
    } catch (err) {
      setIsOpen(!next); // rollback
      toast.error(err instanceof Error ? err.message : 'Failed to update store');
    } finally {
      setIsToggling(false);
    }
  };

  useEffect(() => {
    if (!store) {
      setOrders([]);
      setAreOrdersLoading(false);
      return;
    }

    setAreOrdersLoading(true);
    setOrdersError(null);

    // Live subscription so stats + recent orders + pending bell badge stay
    // current as new orders arrive and statuses advance.
    const unsub = onSnapshot(
      query(
        collection(db, 'orders'),
        where('storeId', '==', store.id),
        orderBy('createdAt', 'desc'),
      ),
      (snapshot) => {
        const rows: VendorOrder[] = snapshot.docs.map((d) => {
          const data = d.data();
          const created = data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : data.createdAt?.toDate?.() ?? new Date();
          const items = Array.isArray(data.items)
            ? data.items.map((it: any) => ({
                name: it.product?.name ?? 'Item',
                quantity: typeof it.quantity === 'number' ? it.quantity : 1,
              }))
            : [];
          return {
            id: d.id,
            customerName: data.customerName ?? 'Customer',
            items,
            total: typeof data.total === 'number' ? data.total : 0,
            vendorPayout: readVendorPayout(data),
            status: (data.status as OrderStatus) ?? 'pending',
            paymentMethod: typeof data.paymentMethod === 'string' ? data.paymentMethod : 'cash',
            subtotal: typeof data.subtotal === 'number' ? data.subtotal : 0,
            cashGivenToVendor: data.cashGivenToVendor === true,
            cashGivenAmount: typeof data.cashGivenAmount === 'number' ? data.cashGivenAmount : null,
            vendorCashConfirmed: data.vendorCashConfirmed === true,
            vendorCashDisputed: data.vendorCashDisputed === true,
            createdAt: created,
          };
        });
        setOrders(rows);
        setAreOrdersLoading(false);
      },
      (err) => {
        setOrdersError(err instanceof Error ? err.message : String(err));
        setAreOrdersLoading(false);
      },
    );

    return unsub;
  }, [store]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const todays = orders.filter((o) => isToday(o.createdAt));
    const delivered = orders.filter((o) => o.status === 'delivered');
    const deliveredToday = delivered.filter((o) => isToday(o.createdAt));
    return {
      totalOrders,
      todayOrders: todays.length,
      // Revenue = vendor's actual take after platform commission, not gross.
      // We surface this to the vendor as "your earnings".
      totalRevenue: delivered.reduce((sum, o) => sum + o.vendorPayout, 0),
      todayRevenue: deliveredToday.reduce((sum, o) => sum + o.vendorPayout, 0),
      pendingOrders: orders.filter((o) => o.status === 'pending').length,
      preparingOrders: orders.filter((o) => o.status === 'preparing').length,
    };
  }, [orders]);

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  // Cash claims awaiting vendor confirmation — drivers said they paid,
  // vendor hasn't confirmed or disputed yet.
  const pendingCashReceipts = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.paymentMethod === 'cash' &&
          o.cashGivenToVendor &&
          !o.vendorCashConfirmed &&
          !o.vendorCashDisputed,
      ),
    [orders],
  );

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleConfirmCashReceipt = async (orderId: string) => {
    setConfirmingId(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        vendorCashConfirmed: true,
        vendorCashConfirmedAt: serverTimestamp(),
      });
      toast.success('Cash receipt confirmed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDisputeCashReceipt = async (orderId: string) => {
    if (typeof window === 'undefined') return;
    if (!window.confirm("Dispute this cash receipt? Only do this if the driver actually didn't give you the money.")) return;
    setConfirmingId(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        vendorCashDisputed: true,
        vendorCashDisputedAt: serverTimestamp(),
      });
      toast.success('Receipt disputed — driver has been notified');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dispute');
    } finally {
      setConfirmingId(null);
    }
  };

  // ---- Render branches ----------------------------------------------------

  if (isStoreLoading) {
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <DashboardSkeleton />
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
    // Vendor is authenticated but hasn't registered a store yet.
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Set up your store</h1>
            <p className="text-gray-600 mb-6">
              You haven't registered a store yet. Tell us about your business to start receiving orders.
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
        {/* Vendor Header */}
        <div
          className={`bg-gradient-to-r ${
            isOpen ? 'from-primary to-primary-dark' : 'from-gray-600 to-gray-700'
          } text-white`}
        >
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Vendor Dashboard</h1>
                <p className="text-white/80">
                  Welcome back, {store.name}
                  {!isOpen && ' · Currently closed'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button className="relative p-2 hover:bg-white/10 rounded-full">
                  <Bell className="w-6 h-6" />
                  {stats.pendingOrders > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                      {stats.pendingOrders}
                    </span>
                  )}
                </button>
                <button className="p-2 hover:bg-white/10 rounded-full">
                  <Settings className="w-6 h-6" />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-white/10 rounded-full"
                  title="Sign out"
                >
                  <LogOut className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Open / Closed toggle */}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={handleToggleOpen}
                disabled={isToggling}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isOpen
                    ? 'bg-white text-primary'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {isOpen ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                {isToggling ? 'Saving…' : isOpen ? 'Open' : 'Closed'}
              </button>
              <p className="text-sm text-white/80">
                {isOpen
                  ? 'Customers can place orders right now'
                  : 'Customers see "Restaurant Closed" at checkout — flip Open when ready'}
              </p>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {/* Cash receipts to confirm — surfaced prominently at top of dashboard
              because this is the vendor's main landing page. */}
          {pendingCashReceipts.length > 0 && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="font-bold text-amber-900 mb-1">
                💵 Cash receipts to confirm ({pendingCashReceipts.length})
              </h3>
              <p className="text-sm text-amber-800 mb-4">
                Drivers say they've handed you these amounts. Confirm if you received the cash,
                or dispute if you didn't.
              </p>
              <div className="space-y-2">
                {pendingCashReceipts.map((o) => {
                  const claimedAmount =
                    o.cashGivenAmount ?? (o.subtotal > 0 ? o.subtotal : o.total);
                  const isThisConfirming = confirmingId === o.id;
                  return (
                    <div
                      key={o.id}
                      className="bg-white rounded-lg p-3 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">
                          R{claimedAmount.toFixed(2)} from {o.customerName}'s order
                        </p>
                        <p className="text-xs text-gray-500">
                          #{o.id.slice(0, 6)} · delivered{' '}
                          {o.createdAt.toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmCashReceipt(o.id)}
                          disabled={isThisConfirming}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                        >
                          {isThisConfirming ? '…' : 'Confirm received'}
                        </button>
                        <button
                          onClick={() => handleDisputeCashReceipt(o.id)}
                          disabled={isThisConfirming}
                          className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200 disabled:opacity-50"
                        >
                          Dispute
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Link
              href="/vendor/products/new"
              className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Plus className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">Add Product</p>
                  <p className="text-sm text-gray-600">New menu item</p>
                </div>
              </div>
            </Link>

            <Link
              href="/vendor/orders"
              className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <ShoppingBag className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">Orders</p>
                  <p className="text-sm text-gray-600">{stats.pendingOrders} pending</p>
                </div>
              </div>
            </Link>

            <Link
              href="/vendor/products"
              className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">Products</p>
                  <p className="text-sm text-gray-600">Manage menu</p>
                </div>
              </div>
            </Link>

            <Link
              href="/vendor/earnings"
              className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">Earnings</p>
                  <p className="text-sm text-gray-600">View analytics</p>
                </div>
              </div>
            </Link>
          </div>

          {/* Stats Cards */}
          {areOrdersLoading ? (
            <StatsSkeleton />
          ) : ordersError ? (
            <ErrorBanner message={ordersError} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard icon={<ShoppingBag className="w-5 h-5 text-primary" />} value={stats.totalOrders} label="Total Orders" delay={0} />
              <StatCard icon={<TrendingUp className="w-5 h-5 text-primary" />} value={`R${stats.totalRevenue.toLocaleString()}`} label="Total Revenue" delay={0.1} />
              <StatCard icon={<Clock className="w-5 h-5 text-primary" />} value={stats.todayOrders} label="Today's Orders" delay={0.2} tag="Today" />
              <StatCard icon={<Star className="w-5 h-5 text-primary" />} value={store.rating || '—'} label="Store Rating" delay={0.3} tag="Rating" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Orders */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Recent Orders</h2>
                <Link href="/vendor/orders" className="text-primary text-sm font-semibold hover:underline">
                  View All
                </Link>
              </div>

              {areOrdersLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-2/3 mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : ordersError ? (
                <p className="text-sm text-red-600 font-mono break-all">{ordersError}</p>
              ) : recentOrders.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">No orders yet</p>
                  <p className="text-sm text-gray-400">
                    Once customers place orders, they'll show up here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentOrders.map((order) => {
                    const config = statusConfig[order.status];
                    return (
                      <div
                        key={order.id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-primary transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold">#{order.id}</p>
                            <p className="text-sm text-gray-600">{order.customerName}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
                            {config.label}
                          </span>
                        </div>

                        <p className="text-sm text-gray-600 mb-2">
                          {order.items.map((it) => `${it.name} x${it.quantity}`).join(', ')}
                        </p>

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">{relativeTime(order.createdAt)}</span>
                          <span className="font-bold">R{order.total}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* Today's Performance */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <h2 className="text-xl font-bold mb-4">Today's Performance</h2>

              {areOrdersLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">Orders</p>
                        <p className="text-sm text-gray-600">{stats.todayOrders} today</p>
                      </div>
                    </div>
                    <span className="font-bold text-lg">R{stats.todayRevenue.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <Clock className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="font-semibold">Pending</p>
                        <p className="text-sm text-gray-600">{stats.pendingOrders} orders</p>
                      </div>
                    </div>
                    <span className="text-yellow-600 font-semibold">
                      {stats.pendingOrders > 0 ? 'Action Needed' : 'All clear'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold">Preparing</p>
                        <p className="text-sm text-gray-600">{stats.preparingOrders} orders</p>
                      </div>
                    </div>
                    <span className="text-blue-600 font-semibold">
                      {stats.preparingOrders > 0 ? 'In Progress' : 'Idle'}
                    </span>
                  </div>

                  <div className="p-4 bg-gradient-to-r from-primary to-primary-dark rounded-lg text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm opacity-80">Today's Revenue</p>
                        <p className="text-2xl font-bold">R{stats.todayRevenue.toLocaleString()}</p>
                      </div>
                      <TrendingUp className="w-8 h-8 opacity-80" />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

// ---------------------------------------------------------------------------
// Small sub-components

function StatCard({
  icon,
  value,
  label,
  delay,
  tag,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  delay: number;
  tag?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-xl shadow-md p-6"
    >
      <div className="flex items-center justify-between mb-2">
        {icon}
        {tag && <span className="text-xs text-gray-500">{tag}</span>}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-600">{label}</p>
    </motion.div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-md p-6 animate-pulse">
          <div className="h-5 w-5 bg-gray-200 rounded mb-3" />
          <div className="h-7 bg-gray-200 rounded w-1/2 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-primary to-primary-dark text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="h-9 w-64 bg-white/20 rounded mb-2 animate-pulse" />
          <div className="h-4 w-40 bg-white/20 rounded animate-pulse" />
        </div>
      </div>
      <div className="container mx-auto px-4 py-8">
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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-8">
      <p className="font-semibold mb-1">Could not load orders</p>
      <p className="font-mono break-all">{message}</p>
    </div>
  );
}
