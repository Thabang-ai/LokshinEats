'use client';

// Driver Earnings Page
// Shows driver's earnings and performance metrics

import { useState } from 'react';
import { TrendingUp, DollarSign, Package, Star, Clock, ArrowLeft, Calendar, Download } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Mock earnings data (will be replaced with Firebase)
const mockEarnings = {
  totalEarnings: 12450,
  todayEarnings: 680,
  weekEarnings: 4250,
  monthEarnings: 12450,
  totalDeliveries: 89,
  todayDeliveries: 8,
  weekDeliveries: 32,
  monthDeliveries: 89,
  averagePerDelivery: 140,
  rating: 4.9,
  totalReviews: 67,
};

const mockDailyEarnings = [
  { date: 'Mon', earnings: 560, deliveries: 4 },
  { date: 'Tue', earnings: 700, deliveries: 5 },
  { date: 'Wed', earnings: 490, deliveries: 4 },
  { date: 'Thu', earnings: 840, deliveries: 6 },
  { date: 'Fri', earnings: 980, deliveries: 7 },
  { date: 'Sat', earnings: 1120, deliveries: 8 },
  { date: 'Sun', earnings: 560, deliveries: 4 },
];

export default function DriverEarningsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('month');

  const getEarnings = () => {
    switch (selectedPeriod) {
      case 'today': return mockEarnings.todayEarnings;
      case 'week': return mockEarnings.weekEarnings;
      case 'month': return mockEarnings.monthEarnings;
      default: return mockEarnings.totalEarnings;
    }
  };

  const getDeliveries = () => {
    switch (selectedPeriod) {
      case 'today': return mockEarnings.todayDeliveries;
      case 'week': return mockEarnings.weekDeliveries;
      case 'month': return mockEarnings.monthDeliveries;
      default: return mockEarnings.totalDeliveries;
    }
  };

  const maxEarnings = Math.max(...mockDailyEarnings.map(d => d.earnings));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Link href="/driver/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </Link>

        <h1 className="text-3xl font-bold mb-6">Earnings & Performance</h1>

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

        {/* Earnings Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-primary to-primary-dark text-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-6 h-6 opacity-80" />
              <span className="text-xs bg-white/20 px-2 py-1 rounded-full">+15%</span>
            </div>
            <p className="text-3xl font-bold">R{getEarnings().toLocaleString()}</p>
            <p className="text-sm opacity-80">Earnings</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <Package className="w-6 h-6 text-primary" />
              <span className="text-xs text-green-600 font-semibold">+12%</span>
            </div>
            <p className="text-3xl font-bold">{getDeliveries()}</p>
            <p className="text-sm text-gray-600">Deliveries</p>
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
            <p className="text-3xl font-bold">R{mockEarnings.averagePerDelivery}</p>
            <p className="text-sm text-gray-600">Per Delivery</p>
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
          {/* Earnings Chart */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Weekly Earnings</h2>
              <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>

            <div className="flex items-end justify-between h-48 gap-2">
              {mockDailyEarnings.map((day, index) => (
                <div key={day.date} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-primary rounded-t-lg transition-all hover:bg-primary-dark"
                    style={{ height: `${(day.earnings / maxEarnings) * 100}%` }}
                  />
                  <p className="text-xs text-gray-600 mt-2">{day.date}</p>
                  <p className="text-xs font-semibold">R{day.earnings}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Performance Metrics */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <h2 className="text-xl font-bold mb-4">Performance Metrics</h2>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-600">On-Time Delivery Rate</p>
                  <span className="text-sm text-green-600 font-semibold">+5%</span>
                </div>
                <p className="text-2xl font-bold">94%</p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-600">Average Delivery Time</p>
                  <span className="text-sm text-green-600 font-semibold">-2 min</span>
                </div>
                <p className="text-2xl font-bold">18 min</p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-600">Customer Satisfaction</p>
                  <span className="text-sm text-green-600 font-semibold">+0.1</span>
                </div>
                <p className="text-2xl font-bold">4.9/5</p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-600">Peak Hours</p>
                  <span className="text-xs text-gray-500">Most active</span>
                </div>
                <p className="text-2xl font-bold">12-2 PM</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-md p-6"
        >
          <h2 className="text-xl font-bold mb-4">Recent Activity</h2>

          <div className="space-y-3">
            {[
              { action: 'Delivery completed', order: 'ORD-12345', earnings: 25, time: '2 min ago' },
              { action: 'Order accepted', order: 'ORD-12345', earnings: 0, time: '15 min ago' },
              { action: 'Delivery completed', order: 'ORD-12344', earnings: 20, time: '35 min ago' },
              { action: 'Order accepted', order: 'ORD-12344', earnings: 0, time: '45 min ago' },
            ].map((activity, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{activity.action}</p>
                    <p className="text-sm text-gray-600">{activity.order}</p>
                  </div>
                </div>
                <div className="text-right">
                  {activity.earnings > 0 && (
                    <p className="font-bold text-green-600">+R{activity.earnings}</p>
                  )}
                  <p className="text-xs text-gray-500">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
