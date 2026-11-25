/// Dependency wiring and async state for browsing.
///
/// Riverpod is doing two jobs here: dependency injection (the client and
/// repository are constructed once and read by anything that needs them) and
/// async state, where [AsyncValue] gives every screen loading, error and data
/// cases it has to handle explicitly rather than forget.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/providers.dart';
import '../models/product.dart';
import '../models/store.dart';
import '../repositories/store_repository.dart';

final storeRepositoryProvider = Provider<StoreRepository>((ref) {
  return StoreRepository(ref.watch(apiClientProvider));
});

/// Whether the list is filtered to kitchens currently taking orders.
class OpenOnlyFilter extends Notifier<bool> {
  @override
  bool build() => false;

  void toggle() => state = !state;
  void set(bool value) => state = value;
}

final openOnlyFilterProvider = NotifierProvider<OpenOnlyFilter, bool>(
  OpenOnlyFilter.new,
);

/// The free-text search a customer has typed.
class StoreSearchQuery extends Notifier<String> {
  @override
  String build() => '';

  void update(String value) => state = value;
}

final storeSearchQueryProvider = NotifierProvider<StoreSearchQuery, String>(
  StoreSearchQuery.new,
);

/// Whether the list is narrowed to kitchens that deliver to this customer.
///
/// On by default, and only ever visible to a customer whose address the app
/// knows. A kitchen that will not drive to you is not a kitchen you can
/// order from, and listing it is a tease - but the switch exists because a
/// saved address can be out of date, or somebody can be shopping for a
/// delivery somewhere else.
class NearMeFilter extends Notifier<bool> {
  @override
  bool build() => true;

  void set(bool value) => state = value;
}

final nearMeFilterProvider = NotifierProvider<NearMeFilter, bool>(
  NearMeFilter.new,
);

/// The area the list is narrowed to, or null when it is not narrowed.
final deliversToFilterProvider = Provider<String?>((ref) {
  return ref.watch(nearMeFilterProvider) ? ref.watch(homeAreaProvider) : null;
});

/// Kitchens to show, honouring the open-now filter.
///
/// Search is applied client-side in [visibleStoresProvider] rather than here,
/// so typing does not fire a request per keystroke; the list is small enough
/// that filtering it locally is instant and free.
final storesProvider = FutureProvider<List<Store>>((ref) async {
  final repository = ref.watch(storeRepositoryProvider);
  final openOnly = ref.watch(openOnlyFilterProvider);

  return repository.fetchStores(
    openOnly: openOnly,
    deliversTo: ref.watch(deliversToFilterProvider),
  );
});

/// [storesProvider] narrowed by the current search text.
final visibleStoresProvider = Provider<AsyncValue<List<Store>>>((ref) {
  final stores = ref.watch(storesProvider);
  final query = ref.watch(storeSearchQueryProvider).trim().toLowerCase();

  if (query.isEmpty) return stores;

  return stores.whenData((all) {
    return all
        .where((store) {
          return store.name.toLowerCase().contains(query) ||
              store.cuisine.toLowerCase().contains(query) ||
              store.categories.any((c) => c.toLowerCase().contains(query));
        })
        .toList(growable: false);
  });
});

/// The township this customer's saved address is in, or null.
///
/// Read by anything that has to say "they do not deliver to you". Null means
/// the app does not know where they are - signed out, or no address saved -
/// and nothing may be inferred from it: a customer who has not said where
/// they live is not warned off a kitchen on a guess.
///
/// Gated on being signed in so that browsing never reaches for a profile
/// there is nobody to fetch.
final homeAreaProvider = Provider<String?>((ref) {
  if (!ref.watch(isSignedInProvider)) return null;

  final city = ref.watch(profileProvider).value?.address?.city.trim();
  return city == null || city.isEmpty ? null : city;
});

/// One kitchen, for its detail page.
final storeProvider = FutureProvider.family<Store, String>((ref, storeId) {
  return ref.watch(storeRepositoryProvider).fetchStore(storeId);
});

/// A kitchen's menu, available items only.
final storeMenuProvider = FutureProvider.family<List<Product>, String>((
  ref,
  storeId,
) {
  return ref.watch(storeRepositoryProvider).fetchMenu(storeId);
});

/// A menu grouped into its categories, in the order they first appear.
///
/// Derived rather than stored, so it cannot drift from the menu it came from.
final menuByCategoryProvider =
    Provider.family<AsyncValue<Map<String, List<Product>>>, String>((
      ref,
      storeId,
    ) {
      return ref.watch(storeMenuProvider(storeId)).whenData((products) {
        final grouped = <String, List<Product>>{};
        for (final product in products) {
          final key = product.category.isEmpty ? 'Menu' : product.category;
          grouped.putIfAbsent(key, () => []).add(product);
        }
        return grouped;
      });
    });
