/// The kitchen, via the API.
library;

import 'package:lokshineats_core/network/api_client.dart';
import 'package:lokshineats_core/network/api_exception.dart';

import '../models/store.dart';

class StoreRepository {
  const StoreRepository(this._client, this._refreshToken);

  final ApiClient _client;

  /// Forces a fresh Firebase ID token. See [register].
  final Future<void> Function() _refreshToken;

  /// This account's kitchen, or null if they have not registered one.
  ///
  /// A 404 here is an answer, not a failure: it is how the API says "signed
  /// in, no kitchen yet", which is exactly the state the sign-up flow leaves
  /// someone in.
  Future<Store?> fetchMine() async {
    try {
      final response = await _client.get<Store>(
        '/api/v1/stores/mine',
        authenticated: true,
        decode: (json) => Store.fromJson(json! as Map<String, dynamic>),
      );
      return response.data;
    } on ApiException catch (error) {
      if (error.code == ApiErrorCode.notFound) return null;
      // A customer account that has never registered a kitchen is refused the
      // route outright. Same answer as far as this app is concerned: there is
      // no kitchen here yet, and registering one is what fixes it.
      if (error.code == ApiErrorCode.forbidden) return null;
      rethrow;
    }
  }

  /// Register this kitchen.
  ///
  /// This is what makes the account a vendor: any signed-in account may
  /// register a store, and doing so promotes it. Nothing else in this app
  /// works until it has happened, and the role arrives as a claim inside the
  /// Firebase ID token — the one already in hand still says `customer`, so
  /// the token is refreshed here before anything else is attempted. Skipping
  /// that produces a kitchen that exists and an app that is refused every
  /// call about it until the token happens to expire.
  Future<Store> register({
    required String name,
    required String cuisine,
    required String address,
    required String city,
    String? phone,
    String? description,
  }) async {
    final response = await _client.post<Store>(
      '/api/v1/stores',
      body: {
        'name': name.trim(),
        'cuisine': cuisine.trim(),
        'address': address.trim(),
        'city': city.trim(),
        if (phone != null && phone.trim().isNotEmpty)
          'phone': phone.replaceAll(' ', ''),
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
      },
      decode: (json) => Store.fromJson(json! as Map<String, dynamic>),
    );

    await _refreshToken();
    return response.data;
  }

  /// Open or close the kitchen to new orders.
  Future<Store> setOpen({required bool isOpen}) => _update({'isOpen': isOpen});

  Future<Store> _update(Map<String, Object?> changes) async {
    final response = await _client.patch<Store>(
      '/api/v1/stores/mine',
      body: changes,
      decode: (json) => Store.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }
}
