'use client';

// Earnings and Analytics Page for Store Owners
// Shows revenue, analytics, and performance metrics

import { useState } from 'react';
import { TrendingUp, DollarSign, ShoppingBag, Star, ArrowLeft, Calendar, Download } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Mock earnings data (will be replaced with Firebase)
const mockEarnings = {
  totalRevenue: 24500,
  todayRevenue: 1850,
  weekRevenue: 8200,
  monthRevenue: 24500,
  totalOrders: 156,
  todayOrders: 12,
  weekOrders: 52,
  monthOrders: 156,
  averageOrderValue: 157,
  rating: 4.8,
  totalReviews: 234,
};

const mockDailyRevenue = [
  { date: 'Mon', revenue: 1200, orders: 8 },
  { date: 'Tue', revenue: 1450, orders: 10 },
  { date: 'Wed', revenue: 1100, orders: 7 },
  { date: 'Thu', revenue: 1650, orders: 11 },
  { date: 'Fri', revenue: 2100, orders: 14 },
  { date: 'Sat', revenue: 2800, orders: 18 },
  { date: 'Sun', revenue: 1850, orders: 12 },
];

const mockTopProducts = [
  { name: 'Pap & Vleis Combo', orders: 45, revenue: 2925 },
  { name: 'Chicken Kota', orders: 38, revenue: 1710 },
  { name: 'Braai Platter', orders: 28, revenue: 3360 },
  { name: 'Vegetable Stew', orders: 22, revenue: 880 },
  { name: 'Soft Drink', orders: 15, revenue: 225 },
];

export default function EarningsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('month');

  const getRevenue = () => {
    switch (selectedPeriod) {
      case 'today': return mockEarnings.todayRevenue;
      case 'week': return mockEarnings.weekRevenue;
      case 'month': return mockEarnings.monthRevenue;
      default: return mockEarnings.totalRevenue;
    }
  };

  const getOrders = () => {
    switch (selectedPeriod) {
      case 'today': return mockEarnings.todayOrders;
      case 'week': return mockEarnings.weekOrders;
      case 'month': return mockEarnings.monthOrders;
      default: return mockEarnings.totalOrders;
    }
  };

  const maxRevenue = Math.max(...mockDailyRevenue.map(d => d.revenue));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Link href="/vendor/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </Link>

        <h1 className="text-3xl font-bold mb-6">Earnings & Analytics</h1>

        {/* Period Selector */}
        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex items-center gap-4">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div className="flex gap-2">
              {(['today', 'week', 'month'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-4 py-2 rounded-lg font-semibold capitalize transition-colors ${
                    selectedPeriod === period
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-primary to-primary-dark text-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-6 h-6 opacity-80" />
              <span className="text-xs bg-white/20 px-2 py-1 rounded-full">+12%</span>
            </div>
            <p className="text-3xl font-bold">R{getRevenue().toLocaleString()}</p>
            <p className="text-sm opacity-80">Revenue</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <ShoppingBag className="w-6 h-6 text-primary" />
              <span className="text-xs text-green-600 font-semibold">+8%</span>
            </div>
            <p className="text-3xl font-bold">{getOrders()}</p>
            <p className="text-sm text-gray-600">Orders</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              <span className="text-xs text-gray-500">Avg</span>
            </div>
            <p className="text-3xl font-bold">R{mockEarnings.averageOrderValue}</p>
            <p className="text-sm text-gray-600">Avg Order Value</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <Star className="w-6 h-6 text-primary" />
              <span className="text-xs text-gray-500">Rating</span>
            </div>
            <p className="text-3xl font-bold">{mockEarnings.rating}</p>
            <p className="text-sm text-gray-600">{mockEarnings.totalReviews} reviews</p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Revenue Chart */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Weekly Revenue</h2>
              <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>

            <div className="flex items-end justify-between h-48 gap-2">
              {mockDailyRevenue.map((day, index) => (
                <div key={day.date} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-primary rounded-t-lg transition-all hover:bg-primary-dark"
                    style={{ height: `${(day.revenue / maxRevenue) * 100}%` }}
                  />
                  <p className="text-xs text-gray-600 mt-2">{day.date}</p>
                  <p className="text-xs font-semibold">R{day.revenue}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Top Products */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <h2 className="text-xl font-bold mb-4">Top Products</h2>

            <div className="space-y-3">
              {mockTopProducts.map((product, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold text-primary">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.orders} orders</p>
                    </div>
                  </div>
                  <span className="font-bold">R{product.revenue}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Performance Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-md p-6"
        >
          <h2 className="text-xl font-bold mb-4">Performance Metrics</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Acceptance Rate</p>
              <p className="text-2xl font-bold">94%</p>
              <p className="text-xs text-green-600">+2% from last week</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Average Prep Time</p>
              <p className="text-2xl font-bold">18 min</p>
              <p className="text-xs text-green-600">-3 min from last week</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">On-Time Delivery</p>
              <p className="text-2xl font-bold">89%</p>
              <p className="text-xs text-green-600">+5% from last week</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Customer Satisfaction</p>
              <p className="text-2xl font-bold">4.8/5</p>
              <p className="text-xs text-green-600">+0.2 from last week</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Repeat Customers</p>
              <p className="text-2xl font-bold">42%</p>
              <p className="text-xs text-green-600">+8% from last week</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Peak Hours</p>
              <p className="text-2xl font-bold">12-2 PM</p>
              <p className="text-xs text-gray-600">Most orders during lunch</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
