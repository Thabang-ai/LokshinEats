'use client';

// Driver Order Management Page
// Allows drivers to view and manage their deliveries

import { useState } from 'react';
import { CheckCircle, MapPin, Phone, Clock, Package, ArrowLeft, Filter } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

// Mock driver orders (will be replaced with Firebase)
const mockOrders = [
  {
    id: 'ORD-12345',
    storeName: "Mama's Kitchen",
    storeAddress: '123 Main Street, Soweto',
    storePhone: '+27 83 123 4567',
    customerName: 'John Dlamini',
    customerPhone: '+27 82 987 6543',
    customerAddress: '456 Oak Avenue, Soweto',
    status: 'picked_up',
    distance: '2.5 km',
    estimatedTime: '12 min',
    deliveryFee: 25,
    items: ['Pap & Vleis Combo x2', 'Chicken Kota x1'],
    acceptedAt: new Date(Date.now() - 15 * 60 * 1000),
    pickedUpAt: new Date(Date.now() - 5 * 60 * 1000),
  },
  {
    id: 'ORD-12344',
    storeName: 'Kota King',
    storeAddress: '789 Pine Street, Soweto',
    storePhone: '+27 81 555 3333',
    customerName: 'Sarah Nkosi',
    customerPhone: '+27 79 444 2222',
    customerAddress: '321 Elm Road, Soweto',
    status: 'delivered',
    distance: '1.8 km',
    estimatedTime: '8 min',
    deliveryFee: 20,
    items: ['Chicken Kota x2'],
    acceptedAt: new Date(Date.now() - 45 * 60 * 1000),
    pickedUpAt: new Date(Date.now() - 35 * 60 * 1000),
    deliveredAt: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: 'ORD-12343',
    storeName: 'Braai Master',
    storeAddress: '654 Maple Lane, Soweto',
    storePhone: '+27 78 333 1111',
    customerName: 'Mike Mokoena',
    customerPhone: '+27 76 222 0000',
    customerAddress: '987 Cedar Drive, Soweto',
    status: 'delivered',
    distance: '3.2 km',
    estimatedTime: '15 min',
    deliveryFee: 30,
    items: ['Braai Platter x1'],
    acceptedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    pickedUpAt: new Date(Date.now() - 105 * 60 * 1000),
    deliveredAt: new Date(Date.now() - 100 * 60 * 1000),
  },
];

const statusConfig = {
  accepted: { label: 'Accepted', color: 'bg-blue-100 text-blue-700', action: 'Pick Up' },
  picked_up: { label: 'In Transit', color: 'bg-orange-100 text-orange-700', action: 'Deliver' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', action: null },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', action: null },
};

export default function DriverOrdersPage() {
  const [orders, setOrders] = useState(mockOrders);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['accepted', 'picked_up'].includes(order.status);
    if (filter === 'completed') return ['delivered', 'cancelled'].includes(order.status);
    return true;
  });

  const updateOrderStatus = (orderId: string, newStatus: string) => {
    setOrders(prev => prev.map(order =>
      order.id === orderId ? { ...order, status: newStatus as any } : order
    ));
    toast.success(`Order ${orderId} marked as ${newStatus}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/driver/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-2">
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">My Deliveries</h1>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {['all', 'active', 'completed'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab as any)}
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
            <p className="text-gray-600">
              {filter === 'active' ? 'No active deliveries' : 'No orders in this category'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order, index) => {
              const config = statusConfig[order.status as keyof typeof statusConfig];

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
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-500">
                            Accepted at {order.acceptedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${config.color}`}>
                          {config.label}
                        </span>
                        <p className="font-bold text-xl text-primary mt-2">R{order.deliveryFee}</p>
                      </div>
                    </div>

                    {/* Route */}
                    <div className="space-y-3 mb-4">
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-1">Pick Up</p>
                          <p className="font-semibold">{order.storeAddress}</p>
                          <a
                            href={`tel:${order.storePhone}`}
                            className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                          >
                            <Phone className="w-3 h-3" />
                            {order.storePhone}
                          </a>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                        <MapPin className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-1">Drop Off</p>
                          <p className="font-semibold">{order.customerAddress}</p>
                          <a
                            href={`tel:${order.customerPhone}`}
                            className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                          >
                            <Phone className="w-3 h-3" />
                            {order.customerPhone}
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="border-t border-gray-200 pt-4 mb-4">
                      <p className="text-sm text-gray-600">{order.items.join(', ')}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{order.distance} • Est. {order.estimatedTime}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {config.action && (
                      <div className="flex gap-2">
                        {order.status === 'accepted' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'picked_up')}
                            className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                          >
                            Mark as Picked Up
                          </button>
                        )}

                        {order.status === 'picked_up' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'delivered')}
                            className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                          >
                            Mark as Delivered
                          </button>
                        )}

                        <a
                          href={`tel:${order.customerPhone}`}
                          className="p-3 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          <Phone className="w-5 h-5" />
                        </a>
                      </div>
                    )}

                    {/* Delivered Info */}
                    {order.status === 'delivered' && order.deliveredAt && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>
                          Delivered at {order.deliveredAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-xl shadow-md p-4 text-center">
            <p className="text-2xl font-bold">{orders.filter(o => ['accepted', 'picked_up'].includes(o.status)).length}</p>
            <p className="text-sm text-gray-600">Active</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{orders.filter(o => o.status === 'delivered').length}</p>
            <p className="text-sm text-gray-600">Completed</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center">
            <p className="text-2xl font-bold">{orders.length}</p>
            <p className="text-sm text-gray-600">Total</p>
          </div>
        </div>
      </div>
    </div>
  );
}
