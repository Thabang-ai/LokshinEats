/// The menu, and the changes a kitchen makes to it.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/providers.dart';

import '../models/menu_item.dart';
import '../repositories/menu_repository.dart';

/// No automatic retries: a failed load shows a "Try again", not a spinner
/// that quietly keeps asking.
Duration? _noRetry(int retryCount, Object error) => null;

final menuRepositoryProvider = Provider<MenuRepository>((ref) {
  return MenuRepository(ref.watch(apiClientProvider));
});

/// The whole menu, in the order a kitchen reads it: by category, then name.
///
/// Every change goes to the API first and the list is updated from what the
/// API returns, so the screen never shows a price or a switch the server did
/// not accept.
class MenuNotifier extends AsyncNotifier<List<MenuItem>> {
  @override
  Future<List<MenuItem>> build() async {
    if (!ref.watch(isSignedInProvider)) return const [];
    return _sorted(await ref.read(menuRepositoryProvider).fetchMine());
  }

  Future<void> refresh() async {
    final items = await ref.read(menuRepositoryProvider).fetchMine();
    if (ref.mounted) state = AsyncData(_sorted(items));
  }

  Future<MenuItem> add(MenuItemDraft draft) async {
    final created = await ref.read(menuRepositoryProvider).add(draft);
    _apply((items) => [...items, created]);
    return created;
  }

  Future<MenuItem> updateItem(String id, MenuItemDraft draft) async {
    final updated = await ref.read(menuRepositoryProvider).update(id, draft);
    _apply((items) => [for (final i in items) i.id == id ? updated : i]);
    return updated;
  }

  Future<void> setAvailable(String id, {required bool available}) async {
    final updated = await ref
        .read(menuRepositoryProvider)
        .setAvailable(id, available: available);
    _apply((items) => [for (final i in items) i.id == id ? updated : i]);
  }

  Future<void> remove(String id) async {
    await ref.read(menuRepositoryProvider).remove(id);
    _apply((items) => items.where((i) => i.id != id).toList());
  }

  void _apply(List<MenuItem> Function(List<MenuItem>) change) {
    final current = state.value;
    if (current == null || !ref.mounted) return;
    state = AsyncData(_sorted(change(current)));
  }

  static List<MenuItem> _sorted(List<MenuItem> items) {
    final copy = [...items];
    copy.sort((a, b) {
      final byCategory = a.category.toLowerCase().compareTo(
        b.category.toLowerCase(),
      );
      return byCategory != 0
          ? byCategory
          : a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
    return copy;
  }
}

final menuProvider = AsyncNotifierProvider<MenuNotifier, List<MenuItem>>(
  MenuNotifier.new,
  retry: _noRetry,
);

/// The categories already on the menu, for suggesting as a new dish is added.
///
/// Typing "Kota" when the menu already says "Kotas" makes two sections of one
/// thing; offering what exists keeps the menu tidy.
final menuCategoriesProvider = Provider<List<String>>((ref) {
  final items = ref.watch(menuProvider).value ?? const [];
  final seen = <String>{};
  return [
    for (final item in items)
      if (seen.add(item.category.toLowerCase())) item.category,
  ];
});
