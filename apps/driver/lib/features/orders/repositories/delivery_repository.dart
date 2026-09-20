/// Deliveries, via the API.
///
/// Every call here is one the API authorises by role: a driver can list what
/// is unclaimed, claim one, give it back, and move their own delivery along.
/// Nothing in this file decides who may do what — it asks, and reports what
/// the API said.
library;

import 'package:lokshineats_core/network/api_client.dart';

import '../models/delivery.dart';

/// One page of deliveries, with the cursor for the next.
class DeliveryPage {
  const DeliveryPage({required this.deliveries, required this.nextCursor});

  final List<Delivery> deliveries;
  final String? nextCursor;

  bool get hasMore => nextCursor != null;
}

class DeliveryRepository {
  const DeliveryRepository(this._client);

  final ApiClient _client;

  /// Orders no driver has claimed yet.
  ///
  /// Wider than "ready": the API offers an order from the moment the kitchen
  /// accepts it, so a driver can start heading over while the food is still
  /// being made instead of finding out only once it is sitting done.
  Future<DeliveryPage> fetchAvailable({String? cursor, int limit = 20}) {
    return _fetchPage('/api/v1/orders/available', cursor: cursor, limit: limit);
  }

  /// The deliveries assigned to the signed-in driver, newest first.
  Future<DeliveryPage> fetchMine({String? cursor, int limit = 20}) {
    return _fetchPage('/api/v1/orders/assigned', cursor: cursor, limit: limit);
  }

  Future<DeliveryPage> _fetchPage(
    String path, {
    String? cursor,
    required int limit,
  }) async {
    final response = await _client.get<List<Delivery>>(
      path,
      authenticated: true,
      query: {'limit': '$limit', 'cursor': ?cursor},
      decode: (json) => decodeList(json, Delivery.fromJson),
    );

    return DeliveryPage(
      deliveries: response.data,
      nextCursor: response.nextCursor,
    );
  }

  Future<Delivery> fetchOne(String orderId) async {
    final response = await _client.get<Delivery>(
      '/api/v1/orders/$orderId',
      authenticated: true,
      decode: (json) => Delivery.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Claim a delivery.
  ///
  /// Two drivers tapping the same card is the normal case, not the edge case,
  /// so this is a race the API settles in a transaction: the loser gets a
  /// conflict saying another driver took it, and the screen says so rather
  /// than leaving them driving to a kitchen for nothing.
  ///
  /// Claiming an order the kitchen has already finished counts as collecting
  /// it, and the API moves it straight to picked up.
  Future<Delivery> accept(String orderId) async {
    final response = await _client.post<Delivery>(
      '/api/v1/orders/$orderId/accept',
      decode: (json) => Delivery.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Give a claimed delivery back to the pool.
  ///
  /// Only before collecting it. Afterwards the food is in the driver's hands,
  /// and an order nobody is carrying needs a person to sort out, not a tap.
  Future<Delivery> release(String orderId) async {
    final response = await _client.post<Delivery>(
      '/api/v1/orders/$orderId/release',
      decode: (json) => Delivery.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Move a delivery along — in this app, collecting it from the kitchen.
  Future<Delivery> changeStatus(String orderId, DeliveryStatus status) async {
    final response = await _client.patch<Delivery>(
      '/api/v1/orders/$orderId/status',
      body: {'status': status.wire},
      decode: (json) => Delivery.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }
}
