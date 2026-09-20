/// Deliveries, via the API.
///
/// Every call here is one the API authorises by role: a driver can list what
/// is unclaimed, claim one, give it back, and move their own delivery along.
/// Nothing in this file decides who may do what — it asks, and reports what
/// the API said.
library;

import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/network/api_exception.dart';

import '../models/delivery.dart';

/// One page of deliveries, with the cursor for the next.
class PagedDeliveries {
  const PagedDeliveries({required this.deliveries, required this.nextCursor});

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
  Future<PagedDeliveries> fetchAvailable({String? cursor, int limit = 20}) {
    return _fetchPage('/api/v1/orders/available', cursor: cursor, limit: limit);
  }

  /// The deliveries assigned to the signed-in driver, newest first.
  Future<PagedDeliveries> fetchMine({String? cursor, int limit = 20}) {
    return _fetchPage('/api/v1/orders/assigned', cursor: cursor, limit: limit);
  }

  Future<PagedDeliveries> _fetchPage(
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

    return PagedDeliveries(
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

  /// Collect the food from the kitchen.
  ///
  /// Only from `ready`: the kitchen decides when the food is done, and a
  /// driver waiting at the counter cannot declare it finished. Asking earlier
  /// is refused by the API, which is why the screen waits rather than offering
  /// the button.
  Future<Delivery> collect(String orderId) async {
    final response = await _client.patch<Delivery>(
      '/api/v1/orders/$orderId/status',
      body: {'status': DeliveryStatus.pickedUp.wire},
      decode: (json) => Delivery.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Confirm the handover with the code the customer reads out.
  ///
  /// This is the moment everyone gets paid, so it is the customer who proves
  /// it happened, not the driver: the code lives with them and the driver
  /// never sees it. A wrong code comes back as an [ApiException] carrying how
  /// many attempts are left — see [attemptsRemainingIn] — because a driver who
  /// mistyped needs to know they can try again, and one who is guessing needs
  /// to know they cannot keep going.
  Future<Delivery> confirmDelivery(String orderId, String code) async {
    final response = await _client.post<Delivery>(
      '/api/v1/orders/$orderId/complete',
      body: {'code': code.trim()},
      decode: (json) => Delivery.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// Record that the kitchen has been given its share of a cash order.
  ///
  /// The amount is not sent: it is what the driver owes, and the API works it
  /// out from the order. A driver cannot settle up for less by asking to.
  Future<Delivery> recordCashHandover(String orderId) async {
    final response = await _client.post<Delivery>(
      '/api/v1/orders/$orderId/cash-handover',
      decode: (json) => Delivery.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }
}

/// How many code attempts the API says are left, if it said.
int? attemptsRemainingIn(ApiException error) {
  final raw = error.details?['attemptsRemaining'];
  return raw == null ? null : int.tryParse(raw);
}
