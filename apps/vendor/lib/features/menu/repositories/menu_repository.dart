/// The kitchen's menu, via the API.
///
/// Every call is scoped by the API to the signed-in vendor's own store: the
/// id of a dish belonging to another kitchen is refused, whatever this app
/// sends.
library;

import 'package:lokshineats_core/network/api_client.dart';

import '../models/menu_item.dart';

class MenuRepository {
  const MenuRepository(this._client);

  final ApiClient _client;

  /// Every dish, sold out or not, a page at a time until there are no more.
  ///
  /// A kitchen's menu is tens of dishes, not thousands, so reading it whole
  /// is simpler and more honest than showing a partial menu that looks
  /// complete.
  Future<List<MenuItem>> fetchMine() async {
    final items = <MenuItem>[];
    String? cursor;

    do {
      final response = await _client.get<List<MenuItem>>(
        '/api/v1/products/mine',
        authenticated: true,
        query: {'limit': '100', 'cursor': ?cursor},
        decode: (json) => decodeList(json, MenuItem.fromJson),
      );
      items.addAll(response.data);
      cursor = response.nextCursor;
    } while (cursor != null);

    return items;
  }

  Future<MenuItem> add(MenuItemDraft draft) async {
    final response = await _client.post<MenuItem>(
      '/api/v1/products',
      body: draft.toJson(),
      decode: (json) => MenuItem.fromJson(json! as Map<String, dynamic>),
    );
    return response.data;
  }

  Future<MenuItem> update(String id, MenuItemDraft draft) =>
      _patch(id, draft.toJson());

  /// Sold out, or back on. The quick switch a kitchen uses mid-service.
  Future<MenuItem> setAvailable(String id, {required bool available}) =>
      _patch(id, {'available': available});

  /// Take a dish off the menu for good.
  ///
  /// Orders already placed keep their own copy of the dish, so nothing a
  /// customer has been charged for changes. Usually the right move is
  /// [setAvailable] instead; this is for a dish the kitchen will not make
  /// again.
  Future<void> remove(String id) => _client.delete('/api/v1/products/$id');

  Future<MenuItem> _patch(String id, Map<String, Object?> body) async {
    final response = await _client.patch<MenuItem>(
      '/api/v1/products/$id',
      body: body,
      decode: (json) => MenuItem.fromJson(json! as Map<String, dynamic>),
    );
    return response.data;
  }
}
