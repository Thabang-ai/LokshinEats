'use client';

// Driver Dashboard
// Main dashboard for delivery drivers to manage deliveries

import RoleGuard from '../../../components/RoleGuard';

import { useState } from 'react';
import { 
  Package, 
  TrendingUp, 
  Clock, 
  Star, 
  MapPin, 
  Phone, 
  CheckCircle,
  Settings,
  LogOut,
  Bell,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Mock driver data (will be replaced with Firebase)
const mockDriverStats = {
  totalDeliveries: 89,
  todayDeliveries: 8,
  totalEarnings: 12450,
  todayEarnings: 680,
  rating: 4.9,
  isOnline: true,
  currentOrder: null,
};

const mockAvailableOrders = [
  {
    id: 'ORD-12345',
    storeName: "Mama's Kitchen",
    storeAddress: '123 Main Street, Soweto',
    customerName: 'John Dlamini',
    customerAddress: '456 Oak Avenue, Soweto',
    distance: '2.5 km',
    estimatedTime: '12 min',
    deliveryFee: 25,
    items: ['Pap & Vleis Combo x2', 'Chicken Kota x1'],
  },
  {
    id: 'ORD-12344',
    storeName: 'Kota King',
    storeAddress: '789 Pine Street, Soweto',
    customerName: 'Sarah Nkosi',
    customerAddress: '321 Elm Road, Soweto',
    distance: '1.8 km',
    estimatedTime: '8 min',
    deliveryFee: 20,
    items: ['Chicken Kota x2'],
  },
];

export default function DriverDashboard() {
  const [isOnline, setIsOnline] = useState(mockDriverStats.isOnline);
  const [availableOrders] = useState(mockAvailableOrders);

  const toggleOnlineStatus = () => {
    setIsOnline(!isOnline);
  };

  return (
    <RoleGuard allowedRoles={['driver']}>
      <div className="min-h-screen bg-gray-50">
      {/* Driver Header */}
      <div className={`bg-gradient-to-r ${isOnline ? 'from-green-600 to-green-700' : 'from-gray-600 to-gray-700'} text-white`}>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Driver Dashboard</h1>
              <p className="text-white/80">Welcome back, Thabo</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="relative p-2 hover:bg-white/10 rounded-full">
                <Bell className="w-6 h-6" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  2
                </span>
              </button>
              <Link href="/profile" className="p-2 hover:bg-white/10 rounded-full">
                <Settings className="w-6 h-6" />
              </Link>
              <button className="p-2 hover:bg-white/10 rounded-full">
                <LogOut className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Online Status Toggle */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={toggleOnlineStatus}
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
              {isOnline ? 'You can receive delivery requests' : 'You won\'t receive new orders'}
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <Package className="w-5 h-5 text-primary" />
              <span className="text-xs text-green-600 font-semibold">+15%</span>
            </div>
            <p className="text-2xl font-bold">{mockDriverStats.totalDeliveries}</p>
            <p className="text-sm text-gray-600">Total Deliveries</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span className="text-xs text-green-600 font-semibold">+12%</span>
            </div>
            <p className="text-2xl font-bold">R{mockDriverStats.totalEarnings.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Total Earnings</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-5 h-5 text-primary" />
              <span className="text-xs text-gray-500">Today</span>
            </div>
            <p className="text-2xl font-bold">{mockDriverStats.todayDeliveries}</p>
            <p className="text-sm text-gray-600">Today's Deliveries</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <Star className="w-5 h-5 text-primary" />
              <span className="text-xs text-gray-500">Rating</span>
            </div>
            <p className="text-2xl font-bold">{mockDriverStats.rating}</p>
            <p className="text-sm text-gray-600">Driver Rating</p>
          </motion.div>
        </div>

        {/* Available Orders */}
        {isOnline && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h2 className="text-2xl font-bold mb-4">Available Deliveries</h2>

            {availableOrders.length === 0 ? (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No orders available right now</p>
                <p className="text-sm text-gray-400 mt-2">Stay online to receive delivery requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {availableOrders.map((order, index) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white rounded-xl shadow-md p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-lg">#{order.id}</h3>
                        <p className="text-gray-600">{order.storeName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-xl text-primary">R{order.deliveryFee}</p>
                        <p className="text-sm text-gray-600">{order.distance}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500">Pick Up</p>
                            <p className="text-sm font-semibold">{order.storeAddress}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500">Drop Off</p>
                            <p className="text-sm font-semibold">{order.customerAddress}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">Est. {order.estimatedTime}</span>
                      </div>
                      <p className="text-sm text-gray-600">{order.items.join(', ')}</p>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        href={`/driver/orders/${order.id}`}
                        className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors text-center"
                      >
                        Accept Delivery
                      </Link>
                      <a
                        href={`tel:+27831234567`}
                        className="p-3 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <Phone className="w-5 h-5" />
                      </a>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Link
            href="/driver/orders"
            className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">My Orders</p>
                <p className="text-sm text-gray-600">View deliveries</p>
              </div>
            </div>
          </Link>

          <Link
            href="/driver/earnings"
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

          <Link
            href="/driver/profile"
            className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Profile</p>
                <p className="text-sm text-gray-600">Update info</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
    </RoleGuard>
  );
}
