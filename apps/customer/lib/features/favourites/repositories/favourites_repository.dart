/// Favourite kitchens, from the API.
///
/// Ids only. A favourite is a bookmark: the kitchen behind it is fetched
/// through the store endpoints like any other, so one that closes or is
/// removed simply stops appearing rather than leaving a stale copy of itself
/// on someone's list.
library;

import 'package:lokshineats_core/network/api_client.dart';

class FavouritesRepository {
  const FavouritesRepository(this._client);

  final ApiClient _client;

  static const _path = '/api/v1/users/me/favorites';

  Future<List<String>> fetch() async {
    final response = await _client.get<List<String>>(
      _path,
      authenticated: true,
      decode: _decodeIds,
    );
    return response.data;
  }

  /// Favourite a kitchen. Safe to repeat: the API treats it as a set.
  Future<List<String>> add(String storeId) async {
    final response = await _client.put<List<String>>(
      '$_path/$storeId',
      decode: _decodeIds,
    );
    return response.data;
  }

  /// Un-favourite a kitchen. Also safe to repeat, including for a kitchen
  /// that no longer exists.
  Future<void> remove(String storeId) => _client.delete('$_path/$storeId');
}

List<String> _decodeIds(Object? json) => [
  for (final id in (json as List<Object?>? ?? const []))
    if (id is String) id,
];
