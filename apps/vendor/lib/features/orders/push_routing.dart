/// What a push does in the kitchen app.
///
/// A kitchen's notifications are about work arriving: an order placed, a
/// driver coming for it, the food collected, the order completed. There is
/// one screen that answers all of those - the queue - so a push refreshes it
/// rather than navigating anywhere, and the notification itself is left to
/// say what happened.
///
/// The queue already polls. The push is what makes it immediate, which is the
/// difference between a kitchen hearing about an order now and hearing about
/// it on the next poll.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/push/push_listener.dart';
import 'package:lokshineats_core/push/push_messaging.dart';

import 'providers/kitchen_order_providers.dart';

/// Which app this build is, for the device registration.
const vendorPushApp = PushApp.vendor;

/// A push arrived while the app is open: the queue is already on screen, so
/// bring it up to date rather than announcing it over itself.
PushHandler vendorPushArrived(Ref ref) => (message) {
  ref.read(orderQueueProvider.notifier).refresh();
};

/// A push was tapped: the queue is where the work is, and the order that
/// prompted it is at the top of it.
PushHandler vendorPushOpened(Ref ref) => (message) {
  ref.read(orderQueueProvider.notifier).refresh();
};
