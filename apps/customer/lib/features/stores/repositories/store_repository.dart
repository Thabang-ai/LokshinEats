/// Store and menu data, from the API.
///
/// The repository is the only layer that knows the API exists — pages and
/// providers above it work in models. Browsing is public, so none of these
/// calls need a signed-in customer.
library;

import '../../../core/network/api_client.dart';
import '../models/product.dart';
import '../models/store.dart';

class StoreRepository {
  const StoreRepository(this._client);

  final ApiClient _client;

  /// Kitchens customers can browse.
  ///
  /// [openOnly] is the common case for a hungry customer, but the full list
  /// stays reachable so a closed favourite is still findable.
  Future<List<Store>> fetchStores({
    String? city,
    String? cuisine,
    bool openOnly = false,
    int limit = 20,
    String? cursor,
  }) async {
    final response = await _client.get<List<Store>>(
      '/api/v1/stores',
      query: {
        'limit': '$limit',
        if (city != null && city.isNotEmpty) 'city': city,
        if (cuisine != null && cuisine.isNotEmpty) 'cuisine': cuisine,
        if (openOnly) 'openOnly': 'true',
        'cursor': ?cursor,
      },
      decode: (json) => decodeList(json, Store.fromJson),
    );

    return response.data;
  }

  Future<Store> fetchStore(String storeId) async {
    final response = await _client.get<Store>(
      '/api/v1/stores/$storeId',
      decode: (json) => Store.fromJson(json! as Map<String, dynamic>),
    );

    return response.data;
  }

  /// A store's menu.
  ///
  /// Defaults to available items only: showing a customer something they
  /// cannot order is a worse experience than a shorter menu.
  Future<List<Product>> fetchMenu(
    String storeId, {
    bool availableOnly = true,
    int limit = 100,
  }) async {
    final response = await _client.get<List<Product>>(
      '/api/v1/products',
      query: {
        'storeId': storeId,
        'limit': '$limit',
        if (availableOnly) 'availableOnly': 'true',
      },
      decode: (json) => decodeList(json, Product.fromJson),
    );

    return response.data;
  }
}
