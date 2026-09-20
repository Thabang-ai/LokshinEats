/// Order history and live order tracking.
///
/// "Live" is polling the API, not a socket or a Firestore listener, and that
/// is a deliberate choice rather than a shortcut:
///
///  * The API is the one place that decides what a customer may see. It
///    attaches the delivery code for the order's own customer and strips it for
///    everyone else. A Firestore listener would read the raw document and
///    bypass that scoping; this app never talks to Firestore for that reason.
///  * The API is headed for Vercel, where serverless functions cannot hold a
///    WebSocket or a long-lived stream open.
///  * Kitchens take minutes, not milliseconds. A 15-second refresh is live
///    enough to watch, and cheap enough to leave running.
///
/// Push notifications (FCM, a later phase) will make the wait between polls
/// irrelevant for the moments that matter: a push can call [refresh] directly.
library;

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import '../models/order.dart';
import 'checkout_providers.dart';

/// No automatic retries.
///
/// Riverpod 3 retries a failed provider on its own by default. Here that would
/// fight the polling below, and hide a failure the screen should be showing —
/// the customer gets a "Try again" button instead.
Duration? _noRetry(int retryCount, Object error) => null;

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

class MyOrdersState {
  const MyOrdersState({
    required this.orders,
    required this.nextCursor,
    this.isLoadingMore = false,
    this.loadMoreFailed = false,
  });

  static const empty = MyOrdersState(orders: [], nextCursor: null);

  final List<CustomerOrder> orders;
  final String? nextCursor;
  final bool isLoadingMore;

  /// The last attempt to load another page failed. The orders already on
  /// screen are still valid, so this is a banner, not an error screen.
  final bool loadMoreFailed;

  bool get hasMore => nextCursor != null;

  /// Kitchens are still working on these.
  List<CustomerOrder> get active =>
      orders.where((order) => order.status.isActive).toList(growable: false);

  /// Delivered or cancelled.
  List<CustomerOrder> get past =>
      orders.where((order) => !order.status.isActive).toList(growable: false);

  MyOrdersState copyWith({
    List<CustomerOrder>? orders,
    String? nextCursor,
    bool clearCursor = false,
    bool? isLoadingMore,
    bool? loadMoreFailed,
  }) {
    return MyOrdersState(
      orders: orders ?? this.orders,
      nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      loadMoreFailed: loadMoreFailed ?? this.loadMoreFailed,
    );
  }
}

class MyOrdersNotifier extends AsyncNotifier<MyOrdersState> {
  @override
  Future<MyOrdersState> build() async {
    // Rebuilt when someone signs in or out, so one account never sees the
    // previous account's orders.
    if (!ref.watch(isSignedInProvider)) return MyOrdersState.empty;

    final page = await ref.read(orderRepositoryProvider).fetchMyOrders();
    return MyOrdersState(orders: page.orders, nextCursor: page.nextCursor);
  }

  /// Fetch the next page and append it.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;

    state = AsyncData(
      current.copyWith(isLoadingMore: true, loadMoreFailed: false),
    );

    try {
      final page = await ref
          .read(orderRepositoryProvider)
          .fetchMyOrders(cursor: current.nextCursor);
      if (!ref.mounted) return;

      state = AsyncData(
        MyOrdersState(
          orders: [...current.orders, ...page.orders],
          nextCursor: page.nextCursor,
        ),
      );
    } catch (error) {
      if (!ref.mounted) return;
      state = AsyncData(
        current.copyWith(isLoadingMore: false, loadMoreFailed: true),
      );
    }
  }
}

final myOrdersProvider =
    AsyncNotifierProvider.autoDispose<MyOrdersNotifier, MyOrdersState>(
      MyOrdersNotifier.new,
      retry: _noRetry,
    );

// ---------------------------------------------------------------------------
// Tracking one order
// ---------------------------------------------------------------------------

class OrderTracking {
  const OrderTracking({
    required this.order,
    required this.refreshedAt,
    this.refreshFailed = false,
  });

  final CustomerOrder order;

  /// When [order] was last read successfully.
  final DateTime refreshedAt;

  /// The most recent refresh failed, so [order] may be out of date. The
  /// screen keeps showing it — the delivery code in particular must not
  /// vanish because the signal dropped at the door.
  final bool refreshFailed;
}

class OrderTrackingNotifier extends AsyncNotifier<OrderTracking> {
  OrderTrackingNotifier(this.orderId);

  final String orderId;

  /// How often an active order is re-read while its screen is open.
  static const pollInterval = Duration(seconds: 15);

  Timer? _timer;
  bool _visible = true;
  bool _inFlight = false;

  @override
  Future<OrderTracking> build() async {
    _visible = true;

    // No point polling for a screen nobody can see, and every poll costs the
    // customer data. Stop while the app is hidden; catch up the moment it
    // comes back.
    final lifecycle = AppLifecycleListener(
      onHide: () {
        _visible = false;
        _timer?.cancel();
      },
      onShow: () {
        _visible = true;
        refresh();
      },
    );

    ref.onDispose(() {
      _timer?.cancel();
      lifecycle.dispose();
    });

    final order = await ref.read(orderRepositoryProvider).fetchOrder(orderId);
    _scheduleNext(order);

    return OrderTracking(order: order, refreshedAt: DateTime.now());
  }

  /// Re-read the order now. Safe to call at any time; a refresh already in
  /// progress is not duplicated.
  Future<void> refresh() async {
    if (_inFlight) return;
    _inFlight = true;
    _timer?.cancel();

    try {
      final order = await ref.read(orderRepositoryProvider).fetchOrder(orderId);
      if (!ref.mounted) return;

      state = AsyncData(
        OrderTracking(order: order, refreshedAt: DateTime.now()),
      );
      _scheduleNext(order);
    } catch (error, stack) {
      if (!ref.mounted) return;

      final previous = state.value;
      if (previous == null) {
        state = AsyncError(error, stack);
        return;
      }

      // Keep what we last knew and keep trying — a dropped connection is the
      // normal case on a phone, not an exceptional one.
      state = AsyncData(
        OrderTracking(
          order: previous.order,
          refreshedAt: previous.refreshedAt,
          refreshFailed: true,
        ),
      );
      _scheduleNext(previous.order);
    } finally {
      _inFlight = false;
    }
  }

  void _scheduleNext(CustomerOrder order) {
    _timer?.cancel();

    // A delivered or cancelled order will not change again, so watching it is
    // pure cost.
    if (!order.status.isActive || !_visible) return;

    _timer = Timer(pollInterval, refresh);
  }
}

final orderTrackingProvider = AsyncNotifierProvider.autoDispose
    .family<OrderTrackingNotifier, OrderTracking, String>(
      OrderTrackingNotifier.new,
      retry: _noRetry,
    );
