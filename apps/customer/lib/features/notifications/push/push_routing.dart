/// Where a push takes a customer, and what it refreshes on the way.
///
/// The mechanics - subscribing, showing it, handling the one that launched
/// the app - live in the core package, shared by all three apps. This is the
/// part that is only true of the customer app: a push is about an order they
/// are waiting for, so it opens the tracking screen, which for "on the way"
/// is the screen with the delivery code - the reason they tapped it.
///
/// Handler builders rather than a list of overrides, because Riverpod's
/// `Override` type is not exported by flutter_riverpod and so cannot be
/// written down as a return type.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/push/push_listener.dart';
import 'package:lokshineats_core/notifications/notifications_page.dart';
import 'package:lokshineats_core/push/push_messaging.dart';

import '../../orders/pages/order_tracking_page.dart';
import '../../orders/providers/order_tracking_providers.dart';
import 'package:lokshineats_core/notifications/notification_providers.dart';

/// Which app this build is, for the device registration.
const customerPushApp = PushApp.customer;

/// A push arrived while the app is open: bring what is on screen up to date.
PushHandler customerPushArrived(Ref ref) => (message) {
  ref.read(inboxProvider.notifier).refresh();

  final orderId = message.orderId;
  if (orderId != null && ref.exists(orderTrackingProvider(orderId))) {
    // Someone watching this order sees the change now, not at the next poll.
    ref.read(orderTrackingProvider(orderId).notifier).refresh();
  }
};

/// A push was tapped: open the order it is about.
PushHandler customerPushOpened(Ref ref) => (message) {
  ref.read(inboxProvider.notifier).refresh();

  final orderId = message.orderId;
  if (orderId == null) return;

  appNavigatorKey.currentState?.push(
    MaterialPageRoute<void>(
      builder: (_) => OrderTrackingPage(orderId: orderId),
    ),
  );
};

/// Tapping a notification opens the order it is about - which is what a
/// customer who tapped "Your order is on the way" wants: the screen with
/// their delivery code on it.
NotificationTap customerNotificationTap(Ref ref) => (context, orderId) {
  if (orderId == null) return;
  Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => OrderTrackingPage(orderId: orderId),
    ),
  );
};
