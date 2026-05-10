'use client';

// Order Management Page for Store Owners
// Allows store owners to accept, reject, and manage orders

import { useState } from 'react';
import { CheckCircle, XCircle, Clock, Package, Truck, Phone, MapPin, ArrowLeft, Filter } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

// Mock orders (will be replaced with Firebase)
const mockOrders = [
  {
    id: 'ORD-12345',
    customer: 'John Dlamini',
    phone: '+27 83 123 4567',
    items: [
      { name: 'Pap & Vleis Combo', quantity: 2, price: 65 },
      { name: 'Chicken Kota', quantity: 1, price: 45 },
    ],
    total: 175,
    status: 'pending',
    createdAt: new Date(Date.now() - 5 * 60 * 1000),
    deliveryAddress: {
      street: '456 Oak Avenue',
      city: 'Soweto',
      postalCode: '1800',
    },
    paymentMethod: 'cash',
  },
  {
    id: 'ORD-12344',
    customer: 'Sarah Nkosi',
    phone: '+27 82 987 6543',
    items: [
      { name: 'Braai Platter', quantity: 1, price: 120 },
    ],
    total: 120,
    status: 'confirmed',
    createdAt: new Date(Date.now() - 15 * 60 * 1000),
    deliveryAddress: {
      street: '789 Pine Street',
      city: 'Soweto',
      postalCode: '1801',
    },
    paymentMethod: 'yoco',
  },
  {
    id: 'ORD-12343',
    customer: 'Mike Mokoena',
    phone: '+27 81 555 3333',
    items: [
      { name: 'Vegetable Stew', quantity: 2, price: 40 },
    ],
    total: 80,
    status: 'preparing',
    createdAt: new Date(Date.now() - 25 * 60 * 1000),
    deliveryAddress: {
      street: '321 Elm Road',
      city: 'Soweto',
      postalCode: '1802',
    },
    paymentMethod: 'ozow',
  },
  {
    id: 'ORD-12342',
    customer: 'Lerato Khumalo',
    phone: '+27 79 444 2222',
    items: [
      { name: 'Soft Drink', quantity: 3, price: 15 },
    ],
    total: 45,
    status: 'ready',
    createdAt: new Date(Date.now() - 35 * 60 * 1000),
    deliveryAddress: {
      street: '654 Maple Lane',
      city: 'Soweto',
      postalCode: '1803',
    },
    paymentMethod: 'cash',
  },
];

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700', action: 'Accept/Reject' },
  confirmed: { label: 'Confirmed', icon: CheckCircle, color: 'bg-blue-100 text-blue-700', action: 'Start Preparing' },
  preparing: { label: 'Preparing', icon: Package, color: 'bg-orange-100 text-orange-700', action: 'Mark Ready' },
  ready: { label: 'Ready', icon: Package, color: 'bg-green-100 text-green-700', action: 'Hand to Driver' },
  picked_up: { label: 'Picked Up', icon: Truck, color: 'bg-purple-100 text-purple-700', action: 'Complete' },
  delivered: { label: 'Delivered', icon: CheckCircle, color: 'bg-gray-100 text-gray-700', action: null },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'bg-red-100 text-red-700', action: null },
};

export default function VendorOrdersPage() {
  const [orders, setOrders] = useState(mockOrders);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'completed'>('all');

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    if (filter === 'pending') return order.status === 'pending';
    if (filter === 'active') return ['confirmed', 'preparing', 'ready', 'picked_up'].includes(order.status);
    if (filter === 'completed') return ['delivered', 'cancelled'].includes(order.status);
    return true;
  });

  const updateOrderStatus = (orderId: string, newStatus: string) => {
    setOrders(prev => prev.map(order =>
      order.id === orderId ? { ...order, status: newStatus as any } : order
    ));
    toast.success(`Order ${orderId} status updated to ${newStatus}`);
  };

  const rejectOrder = (orderId: string) => {
    if (confirm('Are you sure you want to reject this order?')) {
      updateOrderStatus(orderId, 'cancelled');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/vendor/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-2">
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Orders</h1>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {['all', 'pending', 'active', 'completed'].map((tab) => (
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
              {filter === 'pending' ? 'No pending orders' : 'No orders in this category'}
            </p>
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
                  className="bg-white rounded-xl shadow-md overflow-hidden"
                >
                  <div className="p-6">
                    {/* Order Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-lg">#{order.id}</h3>
                        <p className="text-gray-600">{order.customer}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-500">
                            {order.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${config.color}`}>
                          <StatusIcon className="w-4 h-4 inline mr-1" />
                          {config.label}
                        </span>

                        <a href={`tel:${order.phone}`} className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg">
                          <Phone className="w-5 h-5" />
                        </a>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="border-t border-gray-200 pt-4 mb-4">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm mb-1">
                          <span>{item.quantity}x {item.name}</span>
                          <span className="font-semibold">R{item.price * item.quantity}</span>
                        </div>
                      ))}
                      <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold">
                        <span>Total</span>
                        <span className="text-primary">R{order.total}</span>
                      </div>
                    </div>

                    {/* Delivery Address */}
                    <div className="border-t border-gray-200 pt-4 mb-4">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-5 h-5 text-primary mt-1" />
                        <div>
                          <p className="font-semibold">Delivery Address</p>
                          <p className="text-sm text-gray-600">
                            {order.deliveryAddress.street}, {order.deliveryAddress.city}, {order.deliveryAddress.postalCode}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Payment Method */}
                    <div className="mb-4">
                      <span className="text-sm text-gray-600">Payment: </span>
                      <span className="font-semibold capitalize">{order.paymentMethod}</span>
                    </div>

                    {/* Action Buttons */}
                    {config.action && (
                      <div className="flex gap-2">
                        {order.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateOrderStatus(order.id, 'confirmed')}
                              className="flex-1 bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                            >
                              Accept Order
                            </button>
                            <button
                              onClick={() => rejectOrder(order.id)}
                              className="px-4 py-2 bg-red-100 text-red-600 rounded-lg font-semibold hover:bg-red-200 transition-colors"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}

                        {order.status === 'confirmed' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                            className="flex-1 bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                          >
                            Start Preparing
                          </button>
                        )}

                        {order.status === 'preparing' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'ready')}
                            className="flex-1 bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                          >
                            Mark as Ready
                          </button>
                        )}

                        {order.status === 'ready' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'picked_up')}
                            className="flex-1 bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                          >
                            Hand to Driver
                          </button>
                        )}

                        {order.status === 'picked_up' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'delivered')}
                            className="flex-1 bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                          >
                            Mark as Delivered
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-xl shadow-md p-4 text-center">
            <p className="text-2xl font-bold">{orders.filter(o => o.status === 'pending').length}</p>
            <p className="text-sm text-gray-600">Pending</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status)).length}</p>
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
