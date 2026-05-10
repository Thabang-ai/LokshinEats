'use client';

// Notifications Component
// Displays in-app notifications

import { useState, useEffect } from 'react';
import { Bell, X, Check, Clock, Package, Truck, Star, CreditCard } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function Notifications() {
  const { notifications, unreadCount, markAsRead, remove, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order_placed':
      case 'order_accepted':
      case 'order_preparing':
      case 'order_ready':
        return <Package className="w-5 h-5 text-primary" />;
      case 'order_picked_up':
      case 'driver_assigned':
      case 'driver_arrived':
        return <Truck className="w-5 h-5 text-blue-600" />;
      case 'order_delivered':
        return <Check className="w-5 h-5 text-green-600" />;
      case 'order_cancelled':
        return <X className="w-5 h-5 text-red-600" />;
      case 'promo':
        return <Star className="w-5 h-5 text-yellow-600" />;
      case 'system':
        return <Clock className="w-5 h-5 text-gray-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-100 rounded-full transition-colors"
      >
        <Bell className="w-6 h-6 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-semibold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-bold text-lg">Notifications</h3>
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-sm text-primary hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Notifications List */}
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                        !notification.read ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{notification.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{notification.body}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {notification.createdAt.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
                          {!notification.read && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="p-1 hover:bg-gray-200 rounded-full"
                              title="Mark as read"
                            >
                              <Check className="w-4 h-4 text-gray-400" />
                            </button>
                          )}
                          <button
                            onClick={() => remove(notification.id)}
                            className="p-1 hover:bg-gray-200 rounded-full"
                            title="Delete"
                          >
                            <X className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-sm text-primary font-semibold hover:underline"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
