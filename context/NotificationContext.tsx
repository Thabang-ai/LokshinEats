'use client';

// Notification Context
// Provides notification state and functions to the app

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  Notification, 
  getStoredNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  getUnreadNotificationCount,
  sendOrderStatusNotification,
  sendDriverAssignedNotification,
  sendNewOrderNotification,
  sendDriverOrderNotification
} from '../services/notificationService';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
  sendOrderStatus: (orderId: string, status: string, customerName: string) => string;
  sendDriverAssigned: (orderId: string, driverName: string, customerName: string) => string;
  sendNewOrder: (orderId: string, customerName: string, storeName: string) => string;
  sendDriverOrder: (orderId: string, storeName: string, customerAddress: string) => string;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Load notifications from localStorage on mount
  useEffect(() => {
    setNotifications(getStoredNotifications());
    setUnreadCount(getUnreadNotificationCount());
  }, []);

  // Listen for notification events
  useEffect(() => {
    const handleNewNotification = (event: CustomEvent) => {
      setNotifications(prev => [event.detail, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    const handleNotificationRead = (event: CustomEvent) => {
      setNotifications(prev => 
        prev.map(n => n.id === event.detail ? { ...n, read: true } : n)
      );
      setUnreadCount(getUnreadNotificationCount());
    };

    const handleNotificationsReadAll = () => {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    };

    const handleNotificationDeleted = (event: CustomEvent) => {
      setNotifications(prev => prev.filter(n => n.id !== event.detail));
      setUnreadCount(getUnreadNotificationCount());
    };

    const handleNotificationsCleared = () => {
      setNotifications([]);
      setUnreadCount(0);
    };

    window.addEventListener('lokshineats-notification', handleNewNotification as EventListener);
    window.addEventListener('lokshineats-notification-read', handleNotificationRead as EventListener);
    window.addEventListener('lokshineats-notifications-read-all', handleNotificationsReadAll);
    window.addEventListener('lokshineats-notification-deleted', handleNotificationDeleted as EventListener);
    window.addEventListener('lokshineats-notifications-cleared', handleNotificationsCleared);

    return () => {
      window.removeEventListener('lokshineats-notification', handleNewNotification as EventListener);
      window.removeEventListener('lokshineats-notification-read', handleNotificationRead as EventListener);
      window.removeEventListener('lokshineats-notifications-read-all', handleNotificationsReadAll);
      window.removeEventListener('lokshineats-notification-deleted', handleNotificationDeleted as EventListener);
      window.removeEventListener('lokshineats-notifications-cleared', handleNotificationsCleared);
    };
  }, []);

  const markAsRead = (id: string) => {
    markNotificationAsRead(id);
  };

  const markAllAsRead = () => {
    markAllNotificationsAsRead();
  };

  const remove = (id: string) => {
    deleteNotification(id);
  };

  const clearAll = () => {
    clearAllNotifications();
  };

  const sendOrderStatus = (orderId: string, status: string, customerName: string) => {
    return sendOrderStatusNotification(orderId, status, customerName);
  };

  const sendDriverAssigned = (orderId: string, driverName: string, customerName: string) => {
    return sendDriverAssignedNotification(orderId, driverName, customerName);
  };

  const sendNewOrder = (orderId: string, customerName: string, storeName: string) => {
    return sendNewOrderNotification(orderId, customerName, storeName);
  };

  const sendDriverOrder = (orderId: string, storeName: string, customerAddress: string) => {
    return sendDriverOrderNotification(orderId, storeName, customerAddress);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        remove,
        clearAll,
        sendOrderStatus,
        sendDriverAssigned,
        sendNewOrder,
        sendDriverOrder,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
