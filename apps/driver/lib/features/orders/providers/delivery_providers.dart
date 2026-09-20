/// What the driver is looking at, and how it stays current.
///
/// Two lists matter: what is going spare, and what this driver is carrying.
/// Both poll the API rather than listening to Firestore, for the same reason
/// the customer app does — the API is the only thing that decides what a
/// driver may see, and reading the documents directly would go around it.
///
/// The available list polls faster than the customer app's tracking does. A
/// driver staring at an empty board is waiting for work to appear, and a
/// minute of staleness there is a delivery somebody else took.
library;

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/providers.dart';

import '../models/delivery.dart';
import '../repositories/delivery_repository.dart';

/// No automatic retries.
///
/// Riverpod 3 retries a failed provider on its own by default, which would
/// fight the polling below and hide a failure the screen should be showing.
/// The driver gets a "Try again" button instead.
Duration? _noRetry(int retryCount, Object error) => null;

final deliveryRepositoryProvider = Provider<DeliveryRepository>((ref) {
  return DeliveryRepository(ref.watch(apiClientProvider));
});

/// A list of deliveries, kept fresh while the app is in front of the driver.
class DeliveryListState {
  const DeliveryListState({
    required this.deliveries,
    required this.nextCursor,
    required this.refreshedAt,
    this.refreshFailed = false,
  });

  final List<Delivery> deliveries;
  final String? nextCursor;
  final DateTime refreshedAt;

  /// The last refresh failed. What is on screen is still real, just older
  /// than it looks, so this is a note on the list rather than an error screen
  /// that throws away work the driver can still see.
  final bool refreshFailed;

  bool get isEmpty => deliveries.isEmpty;
}

/// Shared polling behaviour for both lists.
///
/// Polling stops while the app is in the background: a driver's phone is in a
/// pocket or a cradle most of the time, and a delivery app that keeps calling
/// an API from there spends their battery and their data for nothing.
abstract class _PollingDeliveries extends AsyncNotifier<DeliveryListState> {
  Timer? _timer;
  AppLifecycleListener? _lifecycle;
  bool _inFlight = false;

  /// How often to ask again while the driver is looking.
  Duration get pollInterval;

  Future<DeliveryPage> fetch(DeliveryRepository repository);

  @override
  Future<DeliveryListState> build() async {
    // Rebuilt on sign-in and sign-out, so one driver never sees another's
    // work — or their own after signing out.
    if (!ref.watch(isSignedInProvider)) {
      return DeliveryListState(
        deliveries: const [],
        nextCursor: null,
        refreshedAt: DateTime.now(),
      );
    }

    ref.onDispose(_stop);
    _watchLifecycle();

    final page = await fetch(ref.read(deliveryRepositoryProvider));
    _schedule();

    return DeliveryListState(
      deliveries: page.deliveries,
      nextCursor: page.nextCursor,
      refreshedAt: DateTime.now(),
    );
  }

  void _watchLifecycle() {
    _lifecycle?.dispose();
    _lifecycle = AppLifecycleListener(
      onHide: _stop,
      onPause: _stop,
      // Back on screen: ask straight away rather than waiting out the
      // interval, because what changed while the phone was away is exactly
      // what the driver has come back to look at.
      onShow: () {
        unawaited(refresh());
        _schedule();
      },
      onRestart: () {
        unawaited(refresh());
        _schedule();
      },
    );
    ref.onDispose(() => _lifecycle?.dispose());
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer.periodic(pollInterval, (_) => unawaited(refresh()));
  }

  void _stop() => _timer?.cancel();

  /// Ask again now. Safe to call from a pull-to-refresh or after an action.
  Future<void> refresh() async {
    if (_inFlight) return;
    _inFlight = true;

    try {
      final page = await fetch(ref.read(deliveryRepositoryProvider));
      if (!ref.mounted) return;

      state = AsyncData(
        DeliveryListState(
          deliveries: page.deliveries,
          nextCursor: page.nextCursor,
          refreshedAt: DateTime.now(),
        ),
      );
    } catch (error) {
      if (!ref.mounted) return;

      final current = state.value;
      if (current == null) {
        // Nothing to keep, so the failure is the whole story.
        state = AsyncError(error, StackTrace.current);
      } else {
        state = AsyncData(
          DeliveryListState(
            deliveries: current.deliveries,
            nextCursor: current.nextCursor,
            refreshedAt: current.refreshedAt,
            refreshFailed: true,
          ),
        );
      }
    } finally {
      _inFlight = false;
    }
  }
}

/// Deliveries nobody has claimed.
class AvailableDeliveriesNotifier extends _PollingDeliveries {
  @override
  Duration get pollInterval => const Duration(seconds: 10);

  @override
  Future<DeliveryPage> fetch(DeliveryRepository repository) =>
      repository.fetchAvailable();
}

final availableDeliveriesProvider =
    AsyncNotifierProvider.autoDispose<
      AvailableDeliveriesNotifier,
      DeliveryListState
    >(AvailableDeliveriesNotifier.new, retry: _noRetry);

/// What this driver is carrying, and what they have already delivered.
class MyDeliveriesNotifier extends _PollingDeliveries {
  @override
  Duration get pollInterval => const Duration(seconds: 20);

  @override
  Future<DeliveryPage> fetch(DeliveryRepository repository) =>
      repository.fetchMine();
}

final myDeliveriesProvider =
    AsyncNotifierProvider.autoDispose<
      MyDeliveriesNotifier,
      DeliveryListState
    >(MyDeliveriesNotifier.new, retry: _noRetry);

/// The deliveries still to finish, in the order they were claimed.
List<Delivery> activeOf(DeliveryListState state) => state.deliveries
    .where((delivery) => delivery.status.isActive)
    .toList(growable: false);

/// Done or cancelled.
List<Delivery> finishedOf(DeliveryListState state) => state.deliveries
    .where((delivery) => !delivery.status.isActive)
    .toList(growable: false);
