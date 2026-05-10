'use client';

// Orders Listing Page
// Shows all user's orders with their status

import { useState } from 'react';
import { Clock, CheckCircle, XCircle, Package, Truck, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Mock orders data (will be replaced with Firebase)
const mockOrders = [
  {
    id: 'ORD-12345',
    status: 'preparing',
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
    total: 175,
    store: {
      name: "Mama's Kitchen",
      image: '🍲',
    },
    items: [
      { name: 'Pap & Vleis Combo', quantity: 2 },
      { name: 'Chicken Kota', quantity: 1 },
    ],
  },
  {
    id: 'ORD-12344',
    status: 'delivered',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    total: 85,
    store: {
      name: 'Kota King',
      image: '🍔',
    },
    items: [
      { name: 'Chicken Kota', quantity: 1 },
      { name: 'Chips & Russian', quantity: 1 },
    ],
  },
  {
    id: 'ORD-12343',
    status: 'cancelled',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    total: 120,
    store: {
      name: 'Braai Master',
      image: '🍖',
    },
    items: [
      { name: 'Braai Platter', quantity: 1 },
    ],
  },
];

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  confirmed: { label: 'Confirmed', icon: CheckCircle, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  preparing: { label: 'Preparing', icon: Package, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  ready: { label: 'Ready', icon: Package, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  picked_up: { label: 'On the Way', icon: Truck, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  delivered: { label: 'Delivered', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100' },
};

export default function OrdersPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const filteredOrders = mockOrders.filter(order => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'].includes(order.status);
    if (filter === 'completed') return ['delivered', 'cancelled'].includes(order.status);
    return true;
  });

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
          {['all', 'active', 'completed'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab as 'all' | 'active' | 'completed')}
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
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">No orders found</h2>
            <p className="text-gray-600 mb-6">
              {filter === 'active' ? 'You have no active orders' : 'Start ordering to see your history'}
            </p>
            <Link
              href="/restaurants"
              className="inline-block bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-dark transition-colors"
            >
              Browse Restaurants
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order, index) => {
              const config = statusConfig[order.status as keyof typeof statusConfig];
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
                            {order.store.image}
                          </div>
                          <div>
                            <h3 className="font-bold">{order.store.name}</h3>
                            <p className="text-sm text-gray-600">Order #{order.id}</p>
                          </div>
                        </div>

                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${config.bgColor}`}>
                          <StatusIcon className={`w-4 h-4 ${config.color}`} />
                          <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <Clock className="w-4 h-4" />
                        <span>{order.createdAt.toLocaleDateString()} at {order.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div className="border-t border-gray-200 pt-3">
                        <div className="flex flex-wrap gap-2 mb-2">
                          {order.items.map((item, idx) => (
                            <span key={idx} className="text-sm text-gray-600">
                              {item.quantity}x {item.name}
                              {idx < order.items.length - 1 && ','}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-lg">R{order.total}</span>
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
