'use client';

// Customer's Orders List
// All orders this customer has placed.

import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  Package,
  Truck,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuthUser } from '../../hooks/useAuthUser';

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

type CustomerOrder = {
  id: string;
  storeName: string;
  storeImage: string;
  status: OrderStatus | string;
  total: number;
  items: { name: string; quantity: number }[];
  createdAt: Date;
};

const statusConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }
> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  confirmed: { label: 'Confirmed', icon: CheckCircle, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  preparing: { label: 'Preparing', icon: Package, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  ready: { label: 'Ready', icon: Package, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  picked_up: { label: 'On the Way', icon: Truck, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  delivered: { label: 'Delivered', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100' },
};

type Filter = 'all' | 'active' | 'completed';

// ---------------------------------------------------------------------------

function tsToDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v.toDate === 'function') return v.toDate();
  return new Date();
}

export default function OrdersPage() {
  const { user, authReady } = useAuthUser();

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!authReady) return;
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
        // Single equality filter — no composite index needed.
        const snapshot = await getDocs(
          query(collection(db, 'orders'), where('customerId', '==', user.uid)),
        );
        const rows: CustomerOrder[] = snapshot.docs.map((d) => {
          const data = d.data();
          const items = Array.isArray(data.items)
            ? data.items.map((it: any) => ({
                name: it.product?.name ?? 'Item',
                quantity: typeof it.quantity === 'number' ? it.quantity : 1,
              }))
            : [];
          return {
            id: d.id,
            storeName: data.storeName ?? 'Unknown',
            storeImage: '🍲',
            status: data.status ?? 'pending',
            total: typeof data.total === 'number' ? data.total : 0,
            items,
            createdAt: tsToDate(data.createdAt),
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
  }, [user, authReady]);

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'active') {
      return orders.filter((o) =>
        ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'].includes(o.status),
      );
    }
    return orders.filter((o) => ['delivered', 'cancelled'].includes(o.status));
  }, [orders, filter]);

  // ---- Render branches ----------------------------------------------------

  if (!authReady || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="h-4 w-24 bg-gray-200 rounded mb-4 animate-pulse" />
          <div className="h-9 w-48 bg-gray-200 rounded mb-6 animate-pulse" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-md p-4 animate-pulse">
                <div className="flex justify-between mb-3">
                  <div className="flex gap-3">
                    <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-gray-200 rounded" />
                      <div className="h-3 w-24 bg-gray-200 rounded" />
                    </div>
                  </div>
                  <div className="h-7 w-24 bg-gray-200 rounded-full" />
                </div>
                <div className="border-t border-gray-100 pt-3 h-10 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Sign in to see your orders</h2>
          <Link
            href="/auth/login"
            className="inline-block mt-4 px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>

        <h1 className="text-3xl font-bold mb-6">Your Orders</h1>

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

        {errorMessage ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
            <p className="font-semibold mb-1">Could not load orders</p>
            <p className="font-mono break-all">{errorMessage}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">No orders yet</h2>
            <p className="text-gray-600 mb-6">Start ordering to see your history here.</p>
            <Link
              href="/restaurants"
              className="inline-block bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-dark transition-colors"
            >
              Browse Restaurants
            </Link>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {filter === 'active' ? 'No active orders right now.' : 'No completed orders yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order, index) => {
              const config = statusConfig[order.status] ?? statusConfig.pending;
              const StatusIcon = config.icon;

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <Link href={`/orders/${order.id}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-primary-light to-primary rounded-lg flex items-center justify-center text-2xl">
                            {order.storeImage}
                          </div>
                          <div>
                            <h3 className="font-bold">{order.storeName}</h3>
                            <p className="text-sm text-gray-600">#{order.id}</p>
                          </div>
                        </div>

                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${config.bgColor}`}>
                          <StatusIcon className={`w-4 h-4 ${config.color}`} />
                          <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <Clock className="w-4 h-4" />
                        <span>
                          {order.createdAt.toLocaleDateString()} at{' '}
                          {order.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="border-t border-gray-200 pt-3">
                        <div className="flex flex-wrap gap-2 mb-2">
                          {order.items.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="text-sm text-gray-600">
                              {item.quantity}x {item.name}
                              {idx < Math.min(order.items.length, 3) - 1 && ','}
                            </span>
                          ))}
                          {order.items.length > 3 && (
                            <span className="text-sm text-gray-500">
                              +{order.items.length - 3} more
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-lg">R{order.total.toFixed(2)}</span>
                          <span className="text-primary text-sm font-semibold">View Details →</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
