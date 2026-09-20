/// The order queue, kept current while the kitchen is looking at it.
///
/// A kitchen has a phone on the counter and a queue that changes without
/// anyone touching it, so this polls hard — ten seconds — and stops the
/// moment the app is out of sight. Polling rather than a Firestore listener
/// for the same reason as the other apps: the API decides what a vendor may
/// see, and reading documents directly would go around it.
library;

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/providers.dart';

import '../models/kitchen_order.dart';
import '../repositories/kitchen_order_repository.dart';

/// No automatic retries: they would fight the polling and hide a failure the
/// screen should be showing.
Duration? _noRetry(int retryCount, Object error) => null;

final kitchenOrderRepositoryProvider = Provider<KitchenOrderRepository>((ref) {
  return KitchenOrderRepository(ref.watch(apiClientProvider));
});

class OrderQueue {
  const OrderQueue({
    required this.orders,
    required this.refreshedAt,
    this.refreshFailed = false,
  });

  final List<KitchenOrder> orders;
  final DateTime refreshedAt;

  /// The last poll failed. What is on the screen is still real, just older
  /// than it looks — a kitchen mid-service should not lose its queue because
  /// one request timed out.
  final bool refreshFailed;

  /// Waiting to be accepted. The only part of this screen that is urgent.
  List<KitchenOrder> get newOrders =>
      orders.where((order) => order.status.needsAnswer).toList(growable: false);

  /// Accepted and not yet finished.
  List<KitchenOrder> get cooking =>
      orders.where((order) => order.status.isInKitchen).toList(growable: false);

  /// Made, waiting for a driver to collect.
  List<KitchenOrder> get ready => orders
      .where((order) => order.status == KitchenOrderStatus.ready)
      .toList(growable: false);

  /// A driver says they handed over cash and nobody has answered.
  List<KitchenOrder> get cashToAnswer =>
      orders.where((order) => order.awaitsCashAnswer).toList(growable: false);

  /// Gone: collected, delivered or cancelled.
  ///
  /// Excludes anything still waiting on a cash answer — it is delivered, but
  /// it is not finished with, and it is already listed where it is asked
  /// about. Listing it twice would put two of the same ticket, and two of the
  /// same pair of buttons, in front of the kitchen.
  List<KitchenOrder> get done => orders
      .where(
        (order) =>
            !order.status.needsAnswer &&
            !order.status.isInKitchen &&
            order.status != KitchenOrderStatus.ready &&
            !order.awaitsCashAnswer,
      )
      .toList(growable: false);

  bool get isEmpty => orders.isEmpty;
}

class OrderQueueNotifier extends AsyncNotifier<OrderQueue> {
  static const pollInterval = Duration(seconds: 10);

  Timer? _timer;
  bool _inFlight = false;

  @override
  Future<OrderQueue> build() async {
    if (!ref.watch(isSignedInProvider)) {
      return OrderQueue(orders: const [], refreshedAt: DateTime.now());
    }

    final lifecycle = AppLifecycleListener(
      onHide: () => _timer?.cancel(),
      onPause: () => _timer?.cancel(),
      onShow: () {
        unawaited(refresh());
        _schedule();
      },
      onRestart: () {
        unawaited(refresh());
        _schedule();
      },
    );

    ref.onDispose(() {
      _timer?.cancel();
      lifecycle.dispose();
    });

    final page = await ref.read(kitchenOrderRepositoryProvider).fetchOrders();
    _schedule();

    return OrderQueue(orders: page.orders, refreshedAt: DateTime.now());
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer.periodic(pollInterval, (_) => unawaited(refresh()));
  }

  Future<void> refresh() async {
    if (_inFlight) return;
    _inFlight = true;

    try {
      final page = await ref.read(kitchenOrderRepositoryProvider).fetchOrders();
      if (!ref.mounted) return;

      state = AsyncData(
        OrderQueue(orders: page.orders, refreshedAt: DateTime.now()),
      );
    } catch (error) {
      if (!ref.mounted) return;

      final current = state.value;
      if (current == null) {
        state = AsyncError(error, StackTrace.current);
      } else {
        state = AsyncData(
          OrderQueue(
            orders: current.orders,
            refreshedAt: current.refreshedAt,
            refreshFailed: true,
          ),
        );
      }
    } finally {
      _inFlight = false;
    }
  }

  /// Put what an action returned straight into the queue.
  ///
  /// The API answers every action with the updated order, so the ticket moves
  /// to its new section immediately instead of after the next poll — which
  /// on a busy counter is the difference between tapping once and tapping
  /// again because nothing appeared to happen.
  void applyResult(KitchenOrder updated) {
    final current = state.value;
    if (current == null || !ref.mounted) return;

    state = AsyncData(
      OrderQueue(
        orders: [
          for (final order in current.orders)
            if (order.id == updated.id) updated else order,
        ],
        refreshedAt: current.refreshedAt,
      ),
    );
  }
}

final orderQueueProvider =
    AsyncNotifierProvider.autoDispose<OrderQueueNotifier, OrderQueue>(
      OrderQueueNotifier.new,
      retry: _noRetry,
    );
