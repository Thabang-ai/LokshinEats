'use client';

// Order Management Page for Store Owners
// Lists every order against the vendor's store and lets them advance status.

import RoleGuard from '../../../components/RoleGuard';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Package,
  Truck,
  Phone,
  MapPin,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useVendorStore } from '../../../hooks/useVendorStore';
import { useBrowserNotifications } from '../../../hooks/useBrowserNotifications';
import { Bell } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

type VendorOrder = {
  id: string;
  customerName: string;
  phone: string | null;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  total: number;
  status: OrderStatus;
  createdAt: Date;
  deliveryAddress: {
    street: string;
    city: string;
    postalCode: string;
  } | null;
  paymentMethod: string;
  // Cash handoff state (only meaningful for delivered cash orders)
  cashGivenToVendor: boolean;
  cashGivenAmount: number | null;
  vendorCashConfirmed: boolean;
  vendorCashDisputed: boolean;
};

const statusConfig: Record<
  OrderStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  pending: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: 'Confirmed', icon: CheckCircle, color: 'bg-indigo-100 text-indigo-700' },
  preparing: { label: 'Preparing', icon: Package, color: 'bg-orange-100 text-orange-700' },
  ready: { label: 'Ready', icon: Package, color: 'bg-green-100 text-green-700' },
  picked_up: { label: 'Picked Up', icon: Truck, color: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'Delivered', icon: CheckCircle, color: 'bg-gray-100 text-gray-700' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'bg-red-100 text-red-700' },
};

type Filter = 'all' | 'pending' | 'active' | 'completed';

// ---------------------------------------------------------------------------

export default function VendorOrdersPage() {
  const { store, isLoading: isStoreLoading, error: storeError } = useVendorStore();
  const { permission: notifPermission, request: requestNotifications, notify } = useBrowserNotifications();

  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [areOrdersLoading, setAreOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Track previously-seen order IDs across snapshots so we can fire a toast
  // when a brand-new order arrives (but not on the initial load).
  const seenOrderIds = useRef<Set<string>>(new Set());
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!store) {
      setOrders([]);
      setAreOrdersLoading(false);
      return;
    }

    setAreOrdersLoading(true);
    setOrdersError(null);
    hasInitialized.current = false;
    seenOrderIds.current = new Set();

    const unsub = onSnapshot(
      query(
        collection(db, 'orders'),
        where('storeId', '==', store.id),
        orderBy('createdAt', 'desc'),
      ),
      (snapshot) => {
        const rows: VendorOrder[] = snapshot.docs.map((d) => {
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
            customerName: data.customerName ?? 'Customer',
            // Real orders write customerPhone at checkout; older seed orders had no phone at all.
            phone:
              typeof data.customerPhone === 'string'
                ? data.customerPhone
                : typeof data.phone === 'string'
                ? data.phone
                : null,
            items,
            subtotal: typeof data.subtotal === 'number' ? data.subtotal : 0,
            total: typeof data.total === 'number' ? data.total : 0,
            status: (data.status as OrderStatus) ?? 'pending',
            createdAt: created,
            deliveryAddress: data.deliveryAddress ?? null,
            paymentMethod: data.paymentMethod ?? 'cash',
            cashGivenToVendor: data.cashGivenToVendor === true,
            cashGivenAmount: typeof data.cashGivenAmount === 'number' ? data.cashGivenAmount : null,
            vendorCashConfirmed: data.vendorCashConfirmed === true,
            vendorCashDisputed: data.vendorCashDisputed === true,
          };
        });

        // Detect brand-new orders that weren't in the last snapshot.
        // Only notify AFTER the initial snapshot (otherwise every order is "new").
        if (hasInitialized.current) {
          const trulyNew = rows.filter((r) => !seenOrderIds.current.has(r.id));
          if (trulyNew.length === 1) {
            const o = trulyNew[0];
            toast.success(`New order from ${o.customerName}! 🔔`);
            notify(`New order: ${o.customerName}`, {
              body: `R${o.total.toFixed(2)} · ${o.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}`,
              tag: o.id, // tag de-dupes if the same notification fires twice
              onClickUrl: '/vendor/orders',
            });
          } else if (trulyNew.length > 1) {
            toast.success(`${trulyNew.length} new orders! 🔔`);
            notify(`${trulyNew.length} new orders`, {
              body: 'Tap to review your orders queue.',
              tag: 'vendor-new-orders-batch',
              onClickUrl: '/vendor/orders',
            });
          }
        }
        seenOrderIds.current = new Set(rows.map((r) => r.id));
        hasInitialized.current = true;

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

  // Optimistic status update with rollback on error.
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;
    const prevStatus = target.status;

    setUpdatingOrderId(orderId);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
    );

    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
      toast.success(`Order ${orderId} → ${statusConfig[newStatus].label}`);
    } catch (err) {
      // Rollback
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: prevStatus } : o)),
      );
      toast.error(err instanceof Error ? err.message : 'Failed to update order');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const rejectOrder = (orderId: string) => {
    if (typeof window !== 'undefined' && window.confirm('Reject this order? This cannot be undone.')) {
      handleStatusChange(orderId, 'cancelled');
    }
  };

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'pending') return orders.filter((o) => o.status === 'pending');
    if (filter === 'active') {
      return orders.filter((o) => ['preparing', 'ready', 'picked_up'].includes(o.status));
    }
    // completed
    return orders.filter((o) => ['delivered', 'cancelled'].includes(o.status));
  }, [orders, filter]);

  const stats = useMemo(() => {
    return {
      pending: orders.filter((o) => o.status === 'pending').length,
      active: orders.filter((o) => ['preparing', 'ready', 'picked_up'].includes(o.status)).length,
      completed: orders.filter((o) => o.status === 'delivered').length,
      total: orders.length,
    };
  }, [orders]);

  // Cash claims awaiting confirmation: driver said they handed over the
  // cash, vendor hasn't confirmed or disputed yet.
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
              You need a registered store before you can manage orders.
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <Link
                href="/vendor/dashboard"
                className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold">Orders</h1>
              <p className="text-sm text-gray-500 mt-1">{store.name}</p>
            </div>
          </div>

          {/* Enable notifications banner — only shows when permission is 'default' */}
          {notifPermission === 'default' && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-900">Get notified of new orders</p>
                  <p className="text-sm text-blue-800">
                    Allow browser notifications so you hear about orders even when this tab is in the background.
                  </p>
                </div>
              </div>
              <button
                onClick={requestNotifications}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 flex-shrink-0"
              >
                Enable
              </button>
            </div>
          )}

          {/* Cash receipts awaiting confirmation */}
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

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {(['all', 'pending', 'active', 'completed'] as Filter[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-4 py-2 rounded-lg font-semibold capitalize transition-colors whitespace-nowrap ${
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
          {areOrdersLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl shadow-md p-6 animate-pulse">
                  <div className="flex justify-between mb-4">
                    <div className="space-y-2">
                      <div className="h-5 bg-gray-200 rounded w-32" />
                      <div className="h-4 bg-gray-200 rounded w-24" />
                    </div>
                    <div className="h-7 bg-gray-200 rounded w-24" />
                  </div>
                  <div className="border-t border-gray-100 pt-4 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-full" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : ordersError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              <p className="font-semibold mb-1">Could not load orders</p>
              <p className="font-mono break-all">{ordersError}</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">
                {orders.length === 0 ? 'No orders yet' : 'No orders match this filter'}
              </h2>
              <p className="text-gray-600">
                {orders.length === 0
                  ? "Once customers place orders, they'll show up here."
                  : filter === 'pending'
                  ? 'No pending orders right now.'
                  : filter === 'active'
                  ? 'No orders currently being prepared or delivered.'
                  : 'No completed orders in your history yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order, index) => {
                const config = statusConfig[order.status];
                const StatusIcon = config.icon;
                const isUpdating = updatingOrderId === order.id;

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
                          <p className="text-gray-600">{order.customerName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-500">
                              {order.createdAt.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {' · '}
                              {order.createdAt.toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-semibold ${config.color}`}
                          >
                            <StatusIcon className="w-4 h-4 inline mr-1" />
                            {config.label}
                          </span>

                          {order.phone && (
                            <a
                              href={`tel:${order.phone}`}
                              className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg"
                              title={`Call ${order.customerName}`}
                            >
                              <Phone className="w-5 h-5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Order Items */}
                      <div className="border-t border-gray-200 pt-4 mb-4">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm mb-1">
                            <span>
                              {item.quantity}x {item.name}
                            </span>
                            <span className="font-semibold">R{item.price * item.quantity}</span>
                          </div>
                        ))}
                        <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold">
                          <span>Total</span>
                          <span className="text-primary">R{order.total}</span>
                        </div>
                      </div>

                      {/* Delivery Address */}
                      {order.deliveryAddress && (
                        <div className="border-t border-gray-200 pt-4 mb-4">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-5 h-5 text-primary mt-1" />
                            <div>
                              <p className="font-semibold">Delivery Address</p>
                              <p className="text-sm text-gray-600">
                                {order.deliveryAddress.street}, {order.deliveryAddress.city},{' '}
                                {order.deliveryAddress.postalCode}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Payment Method */}
                      <div className="mb-4">
                        <span className="text-sm text-gray-600">Payment: </span>
                        <span className="font-semibold capitalize">{order.paymentMethod}</span>
                        {!order.phone && (
                          <span className="ml-3 text-xs text-gray-400">
                            (no phone on file)
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <ActionButtons
                        status={order.status}
                        isUpdating={isUpdating}
                        onAccept={() => handleStatusChange(order.id, 'preparing')}
                        onReject={() => rejectOrder(order.id)}
                        onMarkReady={() => handleStatusChange(order.id, 'ready')}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Quick Stats footer */}
          {!areOrdersLoading && !ordersError && orders.length > 0 && (
            <div className="grid grid-cols-4 gap-4 mt-6">
              <StatBlock label="Pending" value={stats.pending} />
              <StatBlock label="Active" value={stats.active} valueClass="text-blue-600" />
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

function ActionButtons({
  status,
  isUpdating,
  onAccept,
  onReject,
  onMarkReady,
}: {
  status: OrderStatus;
  isUpdating: boolean;
  onAccept: () => void;
  onReject: () => void;
  onMarkReady: () => void;
}) {
  const disabledCls = 'disabled:opacity-50 disabled:cursor-not-allowed';
  const primaryBtn = `flex-1 bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors ${disabledCls}`;

  if (status === 'pending') {
    return (
      <div className="flex gap-2">
        <button onClick={onAccept} disabled={isUpdating} className={primaryBtn}>
          {isUpdating ? 'Updating…' : 'Accept Order'}
        </button>
        <button
          onClick={onReject}
          disabled={isUpdating}
          className={`px-4 py-2 bg-red-100 text-red-600 rounded-lg font-semibold hover:bg-red-200 transition-colors ${disabledCls}`}
          title="Reject order"
        >
          <XCircle className="w-5 h-5" />
        </button>
      </div>
    );
  }

  if (status === 'preparing') {
    return (
      <button onClick={onMarkReady} disabled={isUpdating} className={`w-full ${primaryBtn}`}>
        {isUpdating ? 'Updating…' : 'Mark as Ready'}
      </button>
    );
  }

  // ready / picked_up / delivered / cancelled / confirmed → no vendor action.
  // ready → picked_up happens transactionally when a driver clicks Accept.
  // picked_up → delivered is the driver's call from /driver/dashboard.
  return null;
}

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

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="h-4 w-32 bg-gray-200 rounded mb-2 animate-pulse" />
        <div className="h-9 w-40 bg-gray-200 rounded mb-6 animate-pulse" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-md p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
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
