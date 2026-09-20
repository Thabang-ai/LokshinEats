/// The kitchen's orders, via the API.
///
/// What a kitchen may do to an order is the API's decision, enforced by role
/// and by the order's current status. This asks; it does not adjudicate.
library;

import 'package:lokshineats_core/network/api_client.dart';

import '../models/kitchen_order.dart';

class PagedOrders {
  const PagedOrders({required this.orders, required this.nextCursor});

  final List<KitchenOrder> orders;
  final String? nextCursor;

  bool get hasMore => nextCursor != null;
}

class KitchenOrderRepository {
  const KitchenOrderRepository(this._client);

  final ApiClient _client;

  /// Every order for this kitchen, newest first.
  Future<PagedOrders> fetchOrders({String? cursor, int limit = 30}) async {
    final response = await _client.get<List<KitchenOrder>>(
      '/api/v1/orders/store',
      authenticated: true,
      query: {'limit': '$limit', 'cursor': ?cursor},
      decode: (json) => decodeList(json, KitchenOrder.fromJson),
    );

    return PagedOrders(orders: response.data, nextCursor: response.nextCursor);
  }

  /// Accept a new order and start cooking.
  ///
  /// One step rather than two: accepting is what a kitchen does when it
  /// starts making the food, and a separate "confirmed" tap in between was
  /// something to forget rather than something to decide.
  Future<KitchenOrder> accept(String orderId) =>
      _setStatus(orderId, KitchenOrderStatus.preparing);

  /// The food is made and waiting for a driver.
  Future<KitchenOrder> markReady(String orderId) =>
      _setStatus(orderId, KitchenOrderStatus.ready);

  /// Turn an order down, or stop one already accepted.
  ///
  /// What this costs is not the app's to decide: the API applies the
  /// cancellation tiers, which for a kitchen cancelling means the customer is
  /// refunded in full and the kitchen is paid nothing — the reason the
  /// confirmation says so out loud.
  Future<KitchenOrder> cancel(String orderId) =>
      _setStatus(orderId, KitchenOrderStatus.cancelled);

  Future<KitchenOrder> _setStatus(
    String orderId,
    KitchenOrderStatus status,
  ) async {
    final response = await _client.patch<KitchenOrder>(
      '/api/v1/orders/$orderId/status',
      body: {'status': status.wire},
      decode: (json) => KitchenOrder.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Answer a driver who says they handed over the cash for an order.
  ///
  /// Two real answers, and the honest one matters: confirming settles the
  /// order, disputing leaves it flagged for a person to sort out. The app
  /// must not make either of them the easy accident.
  Future<KitchenOrder> answerCashHandover(
    String orderId, {
    required bool received,
  }) async {
    final response = await _client.post<KitchenOrder>(
      '/api/v1/orders/$orderId/cash-receipt',
      body: {'outcome': received ? 'confirm' : 'dispute'},
      decode: (json) => KitchenOrder.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }
}
