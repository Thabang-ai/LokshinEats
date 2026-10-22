/// What a push does in the driver app.
///
/// A driver's notifications are about work: a delivery available to claim, or
/// one that another driver got first. Both change the same screen - the board
/// of available deliveries - so a push refreshes it. Being told promptly that
/// a job is gone matters as much as being told it exists: a driver who sets
/// off for a delivery someone else has wastes the trip.
///
/// The board already polls. The push is what makes it immediate.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/push/push_listener.dart';
import 'package:lokshineats_core/push/push_messaging.dart';

import 'providers/delivery_providers.dart';

/// Which app this build is, for the device registration.
const driverPushApp = PushApp.driver;

/// A push arrived while the app is open: refresh both boards, because a
/// delivery taken by someone else leaves one list and a claim joins the other.
PushHandler driverPushArrived(Ref ref) => (message) {
  if (ref.exists(availableDeliveriesProvider)) {
    ref.read(availableDeliveriesProvider.notifier).refresh();
  }
  if (ref.exists(myDeliveriesProvider)) {
    ref.read(myDeliveriesProvider.notifier).refresh();
  }
};

/// A push was tapped: the board is where the work is.
PushHandler driverPushOpened(Ref ref) => (message) {
  if (ref.exists(availableDeliveriesProvider)) {
    ref.read(availableDeliveriesProvider.notifier).refresh();
  }
};
