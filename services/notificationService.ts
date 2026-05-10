// Notification Service
// Handles push notifications, order updates, and driver notifications

export type NotificationType = 
  | 'order_placed'
  | 'order_accepted'
  | 'order_preparing'
  | 'order_ready'
  | 'order_picked_up'
  | 'order_delivered'
  | 'order_cancelled'
  | 'driver_assigned'
  | 'driver_arrived'
  | 'promo'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: Date;
  userId?: string;
}

/**
 * Request permission for push notifications
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('This browser does not support desktop notification');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

/**
 * Send a local notification (in-app or browser notification)
 */
export function sendNotification(notification: Omit<Notification, 'id' | 'read' | 'createdAt'>): string {
  const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const fullNotification: Notification = {
    ...notification,
    id,
    read: false,
    createdAt: new Date(),
  };

  // Send browser notification if permission granted
  if (Notification.permission === 'granted') {
    new Notification(notification.title, {
      body: notification.body,
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      data: notification.data,
    });
  }

  // Store in localStorage for in-app notifications
  const existingNotifications = getStoredNotifications();
  existingNotifications.unshift(fullNotification);
  localStorage.setItem('kLokshinEats-notifications', JSON.stringify(existingNotifications));

  // Dispatch custom event for in-app notification
  window.dispatchEvent(new CustomEvent('kLokshinEats-notification', { detail: fullNotification }));

  return id;
}

/**
 * Get stored notifications from localStorage
 */
export function getStoredNotifications(): Notification[] {
  if (typeof window === 'undefined') return [];
  
  const stored = localStorage.getItem('kLokshinEats-notifications');
  if (!stored) return [];
  
  try {
    const notifications = JSON.parse(stored);
    return notifications.map((n: any) => ({
      ...n,
      createdAt: new Date(n.createdAt),
    }));
  } catch {
    return [];
  }
}

/**
 * Mark notification as read
 */
export function markNotificationAsRead(notificationId: string): void {
  const notifications = getStoredNotifications();
  const updated = notifications.map(n =>
    n.id === notificationId ? { ...n, read: true } : n
  );
  localStorage.setItem('kLokshinEats-notifications', JSON.stringify(updated));
  
  window.dispatchEvent(new CustomEvent('kLokshinEats-notification-read', { detail: notificationId }));
}

/**
 * Mark all notifications as read
 */
export function markAllNotificationsAsRead(): void {
  const notifications = getStoredNotifications();
  const updated = notifications.map(n => ({ ...n, read: true }));
  localStorage.setItem('kLokshinEats-notifications', JSON.stringify(updated));
  
  window.dispatchEvent(new CustomEvent('kLokshinEats-notifications-read-all'));
}

/**
 * Delete notification
 */
export function deleteNotification(notificationId: string): void {
  const notifications = getStoredNotifications();
  const updated = notifications.filter(n => n.id !== notificationId);
  localStorage.setItem('kLokshinEats-notifications', JSON.stringify(updated));
  
  window.dispatchEvent(new CustomEvent('kLokshinEats-notification-deleted', { detail: notificationId }));
}

/**
 * Clear all notifications
 */
export function clearAllNotifications(): void {
  localStorage.removeItem('kLokshinEats-notifications');
  window.dispatchEvent(new CustomEvent('kLokshinEats-notifications-cleared'));
}

/**
 * Get unread notification count
 */
export function getUnreadNotificationCount(): number {
  const notifications = getStoredNotifications();
  return notifications.filter(n => !n.read).length;
}

/**
 * Send order status notification
 */
export function sendOrderStatusNotification(
  orderId: string,
  status: string,
  customerName: string
): string {
  const messages: Record<string, { title: string; body: string }> = {
    accepted: {
      title: 'Order Accepted!',
      body: `Your order #${orderId} has been accepted by the restaurant.`,
    },
    preparing: {
      title: 'Order is Being Prepared',
      body: `Your order #${orderId} is being prepared.`,
    },
    ready: {
      title: 'Order Ready for Pickup',
      body: `Your order #${orderId} is ready and waiting for a driver.`,
    },
    picked_up: {
      title: 'Driver Picked Up Your Order',
      body: `Your order #${orderId} is on the way!`,
    },
    delivered: {
      title: 'Order Delivered!',
      body: `Your order #${orderId} has been delivered. Enjoy your meal!`,
    },
    cancelled: {
      title: 'Order Cancelled',
      body: `Your order #${orderId} has been cancelled.`,
    },
  };

  const message = messages[status] || {
    title: 'Order Update',
    body: `Your order #${orderId} status has been updated to ${status}.`,
  };

  return sendNotification({
    type: `order_${status}` as NotificationType,
    ...message,
    data: { orderId, status },
  });
}

/**
 * Send driver assignment notification
 */
export function sendDriverAssignedNotification(
  orderId: string,
  driverName: string,
  customerName: string
): string {
  return sendNotification({
    type: 'driver_assigned',
    title: 'Driver Assigned',
    body: `${driverName} has been assigned to deliver your order #${orderId}.`,
    data: { orderId, driverName },
  });
}

/**
 * Send new order notification to store owner
 */
export function sendNewOrderNotification(
  orderId: string,
  customerName: string,
  storeName: string
): string {
  return sendNotification({
    type: 'order_placed',
    title: 'New Order Received!',
    body: `New order #${orderId} from ${customerName}`,
    data: { orderId, customerName },
  });
}

/**
 * Send driver order notification
 */
export function sendDriverOrderNotification(
  orderId: string,
  storeName: string,
  customerAddress: string
): string {
  return sendNotification({
    type: 'driver_assigned',
    title: 'New Delivery Available',
    body: `Delivery from ${storeName} to ${customerAddress}`,
    data: { orderId, storeName, customerAddress },
  });
}
