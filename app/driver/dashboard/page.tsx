'use client';

// Driver Dashboard
// Real-time feed of available deliveries + the driver's active deliveries.
// Uses onSnapshot for live updates so drivers see new orders without refresh
// and so an order disappears from the feed the instant another driver claims it.

import RoleGuard from '../../../components/RoleGuard';

import { useEffect, useMemo, useState } from 'react';
import {
  Package,
  TrendingUp,
  Clock,
  Star,
  MapPin,
  CheckCircle,
  Settings,
  LogOut,
  Bell,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../../firebase/config';

// ---------------------------------------------------------------------------
// Types

type DeliveryAddress = {
  street: string;
  city: string;
  postalCode: string;
};

type DriverOrder = {
  id: string;
  storeName: string;
  customerName: string;
  deliveryAddress: DeliveryAddress | null;
  deliveryFee: number;
  total: number;
  items: { name: string; quantity: number }[];
  createdAt: Date;
};

type DeliveredOrder = {
  id: string;
  deliveryFee: number;
  createdAt: Date;
};

// ---------------------------------------------------------------------------

function mapOrderDoc(d: any): DriverOrder {
  const data = d.data();
  const created =
    data.createdAt instanceof Timestamp
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
    storeName: data.storeName ?? 'Unknown store',
    customerName: data.customerName ?? 'Customer',
    deliveryAddress: data.deliveryAddress ?? null,
    deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
    total: typeof data.total === 'number' ? data.total : 0,
    items,
    createdAt: created,
  };
}

function isToday(d: Date) {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ---------------------------------------------------------------------------

export default function DriverDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out');
      router.push('/auth/login');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to logout');
    }
  };

  const [available, setAvailable] = useState<DriverOrder[]>([]);
  const [active, setActive] = useState<DriverOrder[]>([]);
  const [delivered, setDelivered] = useState<DeliveredOrder[]>([]);

  const [isAvailableLoading, setIsAvailableLoading] = useState(true);
  const [isActiveLoading, setIsActiveLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Online/offline kept as local state — Phase 6 will persist to drivers/{uid}.isOnline
  const [isOnline, setIsOnline] = useState(true);

  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Subscribe to auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Subscribe to available deliveries (status='ready' AND driverId=null)
  // This subscription runs even when offline so we know the count, but the UI
  // only renders the feed when isOnline is true.
  useEffect(() => {
    if (!user) return;
    setIsAvailableLoading(true);

    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'ready'),
      where('driverId', '==', null),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAvailable(snap.docs.map(mapOrderDoc));
        setIsAvailableLoading(false);
      },
      (err) => {
        setErrorMessage(err.message);
        setIsAvailableLoading(false);
      },
    );
    return unsub;
  }, [user]);

  // Subscribe to this driver's active deliveries (driverId=uid, status=picked_up)
  useEffect(() => {
    if (!user) return;
    setIsActiveLoading(true);

    const q = query(
      collection(db, 'orders'),
      where('driverId', '==', user.uid),
      where('status', '==', 'picked_up'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setActive(snap.docs.map(mapOrderDoc));
        setIsActiveLoading(false);
      },
      (err) => {
        setErrorMessage(err.message);
        setIsActiveLoading(false);
      },
    );
    return unsub;
  }, [user]);

  // Subscribe to delivered orders for stats (all-time + today)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'orders'),
      where('driverId', '==', user.uid),
      where('status', '==', 'delivered'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: DeliveredOrder[] = snap.docs.map((d) => {
          const data = d.data();
          const created =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : data.createdAt?.toDate?.() ?? new Date();
          return {
            id: d.id,
            deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
            createdAt: created,
          };
        });
        setDelivered(rows);
      },
      (err) => setErrorMessage(err.message),
    );
    return unsub;
  }, [user]);

  // ---- Actions -----------------------------------------------------------

  const acceptDelivery = async (orderId: string) => {
    if (!user) {
      toast.error('Not signed in');
      return;
    }
    setClaimingId(orderId);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'orders', orderId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Order no longer exists');
        const data = snap.data();
        if (data.driverId) throw new Error('Already taken by another driver');
        if (data.status !== 'ready') throw new Error('Order is no longer ready for pickup');
        tx.update(ref, {
          driverId: user.uid,
          status: 'picked_up',
          pickedUpAt: serverTimestamp(),
        });
      });
      toast.success('Delivery accepted');
      // No manual state update needed — the onSnapshot listeners flip the
      // order out of `available` and into `active` automatically.
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setClaimingId(null);
    }
  };

  const markDelivered = async (orderId: string) => {
    if (!user) return;
    setCompletingId(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'delivered',
        actualDeliveryTime: serverTimestamp(),
      });
      toast.success('Delivery completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setCompletingId(null);
    }
  };

  // ---- Derived stats ------------------------------------------------------

  const stats = useMemo(() => {
    const todayDelivered = delivered.filter((o) => isToday(o.createdAt));
    return {
      totalDeliveries: delivered.length,
      todayDeliveries: todayDelivered.length,
      totalEarnings: delivered.reduce((sum, o) => sum + o.deliveryFee, 0),
      todayEarnings: todayDelivered.reduce((sum, o) => sum + o.deliveryFee, 0),
    };
  }, [delivered]);

  // ---- Render branches ----------------------------------------------------

  if (!authReady) {
    return (
      <RoleGuard allowedRoles={['driver']}>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500">Loading…</p>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['driver']}>
      <div className="min-h-screen bg-gray-50">
        {/* Driver Header */}
        <div
          className={`bg-gradient-to-r ${
            isOnline ? 'from-green-600 to-green-700' : 'from-gray-600 to-gray-700'
          } text-white`}
        >
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Driver Dashboard</h1>
                <p className="text-white/80">
                  {user?.displayName ?? user?.email ?? 'Welcome'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button className="relative p-2 hover:bg-white/10 rounded-full">
                  <Bell className="w-6 h-6" />
                  {available.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                      {available.length}
                    </span>
                  )}
                </button>
                <Link href="/profile" className="p-2 hover:bg-white/10 rounded-full">
                  <Settings className="w-6 h-6" />
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-white/10 rounded-full"
                  title="Sign out"
                >
                  <LogOut className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Online Status Toggle */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => setIsOnline(!isOnline)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors ${
                  isOnline
                    ? 'bg-white text-green-600'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {isOnline ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                {isOnline ? 'Online' : 'Offline'}
              </button>
              <p className="text-sm text-white/80">
                {isOnline
                  ? 'You can receive delivery requests'
                  : "You won't receive new orders"}
              </p>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-6 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Live data error</p>
                <p className="font-mono break-all">{errorMessage}</p>
                <p className="mt-1 text-xs">
                  If this mentions an index, click the link in the browser console to auto-create
                  it, then refresh.
                </p>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<Package className="w-5 h-5 text-primary" />}
              value={stats.totalDeliveries}
              label="Total Deliveries"
              delay={0}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5 text-primary" />}
              value={`R${stats.totalEarnings.toLocaleString()}`}
              label="Total Earnings"
              delay={0.1}
            />
            <StatCard
              icon={<Clock className="w-5 h-5 text-primary" />}
              value={stats.todayDeliveries}
              label="Today's Deliveries"
              delay={0.2}
              tag="Today"
            />
            <StatCard
              icon={<Star className="w-5 h-5 text-primary" />}
              value="—"
              label="Driver Rating"
              delay={0.3}
              tag="Coming soon"
            />
          </div>

          {/* My Active Deliveries */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">My Active Deliveries</h2>
            {isActiveLoading ? (
              <FeedSkeleton count={1} />
            ) : active.length === 0 ? (
              <div className="bg-white rounded-xl shadow-md p-8 text-center">
                <p className="text-gray-500">No active deliveries</p>
              </div>
            ) : (
              <div className="space-y-4">
                {active.map((order, index) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    index={index}
                    variant="active"
                    isBusy={completingId === order.id}
                    onComplete={() => markDelivered(order.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Available Deliveries */}
          {isOnline && (
            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                Available Deliveries
                {!isAvailableLoading && available.length > 0 && (
                  <span className="ml-3 text-sm font-normal text-gray-500">
                    ({available.length})
                  </span>
                )}
              </h2>

              {isAvailableLoading ? (
                <FeedSkeleton count={2} />
              ) : available.length === 0 ? (
                <div className="bg-white rounded-xl shadow-md p-12 text-center">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No orders available right now</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Stay online — new orders will appear here in real time
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {available.map((order, index) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      index={index}
                      variant="available"
                      isBusy={claimingId === order.id}
                      onAccept={() => acceptDelivery(order.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <QuickAction href="/driver/orders" icon={<Package className="w-6 h-6 text-primary" />} title="My Orders" subtitle="View deliveries" />
            <QuickAction href="/driver/earnings" icon={<TrendingUp className="w-6 h-6 text-primary" />} title="Earnings" subtitle="View analytics" />
            <QuickAction href="/profile" icon={<Settings className="w-6 h-6 text-primary" />} title="Profile" subtitle="Update info" />
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

// ---------------------------------------------------------------------------
// Sub-components

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

function OrderCard({
  order,
  index,
  variant,
  isBusy,
  onAccept,
  onComplete,
}: {
  order: DriverOrder;
  index: number;
  variant: 'available' | 'active';
  isBusy: boolean;
  onAccept?: () => void;
  onComplete?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white rounded-xl shadow-md p-6"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-lg">#{order.id}</h3>
          <p className="text-gray-600">{order.storeName}</p>
          <p className="text-sm text-gray-500">For {order.customerName}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-xl text-primary">R{order.deliveryFee}</p>
          <p className="text-xs text-gray-500">delivery fee</p>
        </div>
      </div>

      {order.deliveryAddress && (
        <div className="p-3 bg-gray-50 rounded-lg mb-4">
          <div className="flex items-start gap-2">
            <MapPin className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Drop Off</p>
              <p className="text-sm font-semibold">
                {order.deliveryAddress.street}, {order.deliveryAddress.city},{' '}
                {order.deliveryAddress.postalCode}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-600">
            {order.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-sm text-gray-600">
          {order.items.map((it) => `${it.name} x${it.quantity}`).join(', ')}
        </p>
      </div>

      {variant === 'available' && onAccept && (
        <button
          onClick={onAccept}
          disabled={isBusy}
          className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBusy ? 'Claiming…' : 'Accept Delivery'}
        </button>
      )}

      {variant === 'active' && onComplete && (
        <button
          onClick={onComplete}
          disabled={isBusy}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          {isBusy ? 'Completing…' : 'Mark as Delivered'}
        </button>
      )}
    </motion.div>
  );
}

function FeedSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-md p-6 animate-pulse">
          <div className="flex justify-between mb-4">
            <div className="space-y-2">
              <div className="h-5 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-24" />
            </div>
            <div className="h-7 bg-gray-200 rounded w-16" />
          </div>
          <div className="h-16 bg-gray-100 rounded-lg mb-4" />
          <div className="h-10 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
      </div>
    </Link>
  );
}
