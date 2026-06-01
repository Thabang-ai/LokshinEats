'use client';

// Driver Order History
// All orders where this driver is/was the assigned driver. Filter tabs for
// Active (picked_up) and Completed (delivered/cancelled). Read-only mostly —
// status changes happen on the driver dashboard.

import RoleGuard from '../../../components/RoleGuard';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  MapPin,
  Clock,
  Package,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuthUser } from '../../../hooks/useAuthUser';

// ---------------------------------------------------------------------------
// Types

type OrderStatus = 'picked_up' | 'delivered' | 'cancelled';

type DriverOrder = {
  id: string;
  storeName: string;
  customerName: string;
  deliveryAddress: { street: string; city: string; postalCode: string } | null;
  deliveryFee: number;
  items: { name: string; quantity: number }[];
  status: OrderStatus | string;
  createdAt: Date;
  pickedUpAt: Date | null;
  actualDeliveryTime: Date | null;
};

const statusConfig: Record<string, { label: string; color: string }> = {
  picked_up: { label: 'In Transit', color: 'bg-orange-100 text-orange-700' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
};

type Filter = 'all' | 'active' | 'completed';

// ---------------------------------------------------------------------------
// Date helper

function tsToDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v.toDate === 'function') return v.toDate();
  return null;
}

// ---------------------------------------------------------------------------

export default function DriverOrdersPage() {
  const { user, authReady } = useAuthUser();

  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [completingId, setCompletingId] = useState<string | null>(null);
  // OTP entry state — only one order can be in entry mode at a time.
  const [otpModeOrderId, setOtpModeOrderId] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');

  const handleSubmitOTP = async (orderId: string) => {
    const ok = await markDelivered(orderId, otpInput);
    if (ok) {
      setOtpModeOrderId(null);
      setOtpInput('');
    }
  };

  // Fetch all orders this driver is/was assigned to.
  // Single-field equality on driverId — auto-indexed, no composite needed.
  // Sorted client-side to avoid a separate (driverId, createdAt) index.
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
          query(collection(db, 'orders'), where('driverId', '==', user.uid)),
        );
        const rows: DriverOrder[] = snapshot.docs.map((d) => {
          const data = d.data();
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
            items,
            status: data.status ?? 'picked_up',
            createdAt: tsToDate(data.createdAt) ?? new Date(),
            pickedUpAt: tsToDate(data.pickedUpAt),
            actualDeliveryTime: tsToDate(data.actualDeliveryTime),
          };
        });
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'active') return orders.filter((o) => o.status === 'picked_up');
    return orders.filter((o) => o.status === 'delivered' || o.status === 'cancelled');
  }, [orders, filter]);

  const stats = useMemo(
    () => ({
      active: orders.filter((o) => o.status === 'picked_up').length,
      completed: orders.filter((o) => o.status === 'delivered').length,
      total: orders.length,
    }),
    [orders],
  );

  // Verifies the order's deliveryOTP against the entered value before
  // flipping status. Orders created before the OTP feature have no
  // deliveryOTP and skip verification. Returns true on success so the
  // caller can dismiss any inline OTP entry UI.
  const markDelivered = async (orderId: string, otp?: string): Promise<boolean> => {
    setCompletingId(orderId);
    try {
      const ref = doc(db, 'orders', orderId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        toast.error('Order no longer exists');
        return false;
      }
      const data = snap.data();
      const expectedOTP = typeof data.deliveryOTP === 'string' ? data.deliveryOTP : null;

      if (expectedOTP) {
        if (!otp || otp.trim() !== expectedOTP) {
          toast.error('Wrong code. Ask the customer to check their order page.');
          return false;
        }
      }

      // Optimistic update (after OTP check passes)
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: 'delivered', actualDeliveryTime: new Date() } : o,
        ),
      );

      await updateDoc(ref, {
        status: 'delivered',
        actualDeliveryTime: serverTimestamp(),
        ...(expectedOTP ? { deliveryOTPVerified: true } : {}),
      });
      toast.success('Delivery completed');
      return true;
    } catch (err) {
      // Rollback
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: 'picked_up', actualDeliveryTime: null } : o,
        ),
      );
      toast.error(err instanceof Error ? err.message : 'Failed to update');
      return false;
    } finally {
      setCompletingId(null);
    }
  };

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
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold mb-6">My Deliveries</h1>

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-6">
            {(['all', 'active', 'completed'] as Filter[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-4 py-2 rounded-lg font-semibold capitalize transition-colors ${
                  filter === tab
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Orders List */}
          {isLoading ? (
            <ListSkeleton />
          ) : errorMessage ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              <p className="font-semibold mb-1">Could not load deliveries</p>
              <p className="font-mono break-all">{errorMessage}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">No deliveries yet</h2>
              <p className="text-gray-600 mb-6">
                Accept your first order on the dashboard to get started.
              </p>
              <Link
                href="/driver/dashboard"
                className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
              >
                Go to dashboard
              </Link>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <p className="text-gray-500">
                {filter === 'active' ? 'No active deliveries' : 'No completed deliveries yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order, index) => {
                const config = statusConfig[order.status] ?? {
                  label: order.status,
                  color: 'bg-gray-100 text-gray-700',
                };
                const isCompleting = completingId === order.id;

                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-xl shadow-md overflow-hidden"
                  >
                    <div className="p-6">
                      {/* Order Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-bold text-lg">#{order.id}</h3>
                          <p className="text-gray-600">{order.storeName}</p>
                          <p className="text-sm text-gray-500">For {order.customerName}</p>
                        </div>
                        <div className="text-right">
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${config.color}`}>
                            {config.label}
                          </span>
                          <p className="font-bold text-xl text-primary mt-2">R{order.deliveryFee}</p>
                        </div>
                      </div>

                      {/* Drop Off Address */}
                      {order.deliveryAddress && (
                        <div className="p-3 bg-green-50 rounded-lg mb-4">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-gray-500">Drop Off</p>
                              <p className="font-semibold">
                                {order.deliveryAddress.street}, {order.deliveryAddress.city},{' '}
                                {order.deliveryAddress.postalCode}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Items + timing */}
                      <div className="border-t border-gray-200 pt-4 mb-4 flex flex-wrap gap-3 items-center justify-between">
                        <p className="text-sm text-gray-600">
                          {order.items.map((it) => `${it.name} x${it.quantity}`).join(', ')}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Clock className="w-4 h-4" />
                          <span>
                            {order.createdAt.toLocaleDateString()}{' '}
                            {order.createdAt.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Action Button (only for picked_up) */}
                      {order.status === 'picked_up' && otpModeOrderId !== order.id && (
                        <button
                          onClick={() => {
                            setOtpModeOrderId(order.id);
                            setOtpInput('');
                          }}
                          disabled={isCompleting}
                          className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-5 h-5" />
                          Mark as Delivered
                        </button>
                      )}

                      {/* Inline OTP entry */}
                      {order.status === 'picked_up' && otpModeOrderId === order.id && (
                        <div className="border-t border-gray-200 pt-4">
                          <p className="text-sm font-semibold text-gray-700 mb-1">
                            Ask the customer for their 4-digit code
                          </p>
                          <p className="text-xs text-gray-500 mb-3">
                            It's shown in their order tracking page. The order won't complete without it.
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={4}
                              value={otpInput}
                              onChange={(e) =>
                                setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                              }
                              placeholder="0000"
                              autoFocus
                              className="flex-1 text-center text-2xl font-mono tracking-widest border-2 border-gray-300 rounded-lg py-2 focus:outline-none focus:border-primary"
                            />
                            <button
                              onClick={() => handleSubmitOTP(order.id)}
                              disabled={isCompleting || otpInput.length !== 4}
                              className="px-5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isCompleting ? '…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => {
                                setOtpModeOrderId(null);
                                setOtpInput('');
                              }}
                              disabled={isCompleting}
                              className="px-4 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Delivered Info */}
                      {order.status === 'delivered' && order.actualDeliveryTime && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span>
                            Delivered{' '}
                            {order.actualDeliveryTime.toLocaleDateString()}{' '}
                            {order.actualDeliveryTime.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Stats footer */}
          {!isLoading && !errorMessage && orders.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mt-6">
              <StatBlock label="Active" value={stats.active} />
              <StatBlock label="Completed" value={stats.completed} valueClass="text-green-600" />
              <StatBlock label="Total" value={stats.total} />
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}

// ---------------------------------------------------------------------------
// Sub-components

function StatBlock({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-md p-4 text-center">
      <p className={`text-2xl font-bold ${valueClass ?? ''}`}>{value}</p>
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-md p-6 animate-pulse">
          <div className="flex justify-between mb-4">
            <div className="space-y-2">
              <div className="h-5 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-24" />
            </div>
            <div className="h-7 bg-gray-200 rounded w-24" />
          </div>
          <div className="h-16 bg-gray-100 rounded-lg mb-4" />
          <div className="h-10 bg-gray-200 rounded" />
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
        <div className="h-9 w-40 bg-gray-200 rounded mb-6 animate-pulse" />
        <ListSkeleton />
      </div>
    </div>
  );
}
