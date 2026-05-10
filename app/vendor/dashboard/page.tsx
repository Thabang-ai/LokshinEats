'use client';

// Store Owner Dashboard
// Main dashboard for store owners to manage their restaurant

import RoleGuard from '../../../components/RoleGuard';

import { useState } from 'react';
import { 
  ShoppingBag, 
  TrendingUp, 
  Clock, 
  Star, 
  Plus, 
  Settings, 
  LogOut,
  Bell,
  Store,
  Package
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Mock dashboard data (will be replaced with Firebase)
const mockStats = {
  totalOrders: 156,
  todayOrders: 12,
  totalRevenue: 24500,
  todayRevenue: 1850,
  rating: 4.8,
  pendingOrders: 3,
  preparingOrders: 2,
};

const mockRecentOrders = [
  {
    id: 'ORD-12345',
    customer: 'John Dlamini',
    items: ['Pap & Vleis Combo x2', 'Chicken Kota x1'],
    total: 175,
    status: 'pending',
    time: '2 min ago',
  },
  {
    id: 'ORD-12344',
    customer: 'Sarah Nkosi',
    items: ['Braai Platter x1'],
    total: 120,
    status: 'preparing',
    time: '15 min ago',
  },
  {
    id: 'ORD-12343',
    customer: 'Mike Mokoena',
    items: ['Vegetable Stew x2'],
    total: 80,
    status: 'ready',
    time: '25 min ago',
  },
];

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  preparing: { label: 'Preparing', color: 'bg-blue-100 text-blue-700' },
  ready: { label: 'Ready', color: 'bg-green-100 text-green-700' },
  picked_up: { label: 'Picked Up', color: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'Delivered', color: 'bg-gray-100 text-gray-700' },
};

export default function VendorDashboard() {
  const [selectedTab, setSelectedTab] = useState('overview');

  return (
    <RoleGuard allowedRoles={['vendor']}>
      <div className="min-h-screen bg-gray-50">
      {/* Vendor Header */}
      <div className="bg-gradient-to-r from-primary to-primary-dark text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Vendor Dashboard</h1>
              <p className="text-white/80">Welcome back, Mama's Kitchen</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="relative p-2 hover:bg-white/10 rounded-full">
                <Bell className="w-6 h-6" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  3
                </span>
              </button>
              <button className="p-2 hover:bg-white/10 rounded-full">
                <Settings className="w-6 h-6" />
              </button>
              <button className="p-2 hover:bg-white/10 rounded-full">
                <LogOut className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
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
                <p className="text-sm text-gray-600">{mockStats.pendingOrders} pending</p>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              <span className="text-xs text-green-600 font-semibold">+12%</span>
            </div>
            <p className="text-2xl font-bold">{mockStats.totalOrders}</p>
            <p className="text-sm text-gray-600">Total Orders</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span className="text-xs text-green-600 font-semibold">+8%</span>
            </div>
            <p className="text-2xl font-bold">R{mockStats.totalRevenue.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Total Revenue</p>
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
            <p className="text-2xl font-bold">{mockStats.todayOrders}</p>
            <p className="text-sm text-gray-600">Today's Orders</p>
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
            <p className="text-2xl font-bold">{mockStats.rating}</p>
            <p className="text-sm text-gray-600">Store Rating</p>
          </motion.div>
        </div>

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

            <div className="space-y-4">
              {mockRecentOrders.map((order, index) => {
                const config = statusConfig[order.status as keyof typeof statusConfig];
                return (
                  <div key={order.id} className="border border-gray-200 rounded-lg p-4 hover:border-primary transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold">#{order.id}</p>
                        <p className="text-sm text-gray-600">{order.customer}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
                        {config.label}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 mb-2">{order.items.join(', ')}</p>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">{order.time}</span>
                      <span className="font-bold">R{order.total}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <h2 className="text-xl font-bold mb-4">Today's Performance</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Orders</p>
                    <p className="text-sm text-gray-600">{mockStats.todayOrders} completed</p>
                  </div>
                </div>
                <span className="font-bold text-lg">R{mockStats.todayRevenue}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Pending</p>
                    <p className="text-sm text-gray-600">{mockStats.pendingOrders} orders</p>
                  </div>
                </div>
                <span className="text-yellow-600 font-semibold">Action Needed</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Preparing</p>
                    <p className="text-sm text-gray-600">{mockStats.preparingOrders} orders</p>
                  </div>
                </div>
                <span className="text-blue-600 font-semibold">In Progress</span>
              </div>

              <div className="p-4 bg-gradient-to-r from-primary to-primary-dark rounded-lg text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Today's Revenue</p>
                    <p className="text-2xl font-bold">R{mockStats.todayRevenue.toLocaleString()}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 opacity-80" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
    </RoleGuard>
  );
}
