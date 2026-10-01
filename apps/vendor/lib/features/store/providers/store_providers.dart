/// The kitchen itself: whether there is one, and whether it is open.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/providers.dart';

import '../models/store.dart';
import '../repositories/store_repository.dart';

final storeRepositoryProvider = Provider<StoreRepository>((ref) {
  final auth = ref.watch(authRepositoryProvider);

  return StoreRepository(
    ref.watch(apiClientProvider),
    // Registering a kitchen promotes the account to vendor, and the role
    // travels in the Firebase ID token. Forcing a refresh here is what makes
    // the very next call succeed.
    () => auth.idToken(forceRefresh: true),
  );
});

/// This account's kitchen, or null when they have not registered one.
///
/// Null is a state the app handles rather than an error: it is where every
/// new vendor starts, and the registration screen is the answer to it.
class MyStoreNotifier extends AsyncNotifier<Store?> {
  @override
  Future<Store?> build() async {
    if (!ref.watch(isSignedInProvider)) return null;
    return ref.read(storeRepositoryProvider).fetchMine();
  }

  /// Register the kitchen and adopt it as the current one.
  Future<Store> register({
    required String name,
    required String cuisine,
    required String address,
    required String city,
    String? phone,
    String? description,
  }) async {
    final store = await ref
        .read(storeRepositoryProvider)
        .register(
          name: name,
          cuisine: cuisine,
          address: address,
          city: city,
          phone: phone,
          description: description,
        );

    if (ref.mounted) state = AsyncData(store);
    return store;
  }

  /// Open or close the kitchen to new orders.
  Future<void> setOpen(bool isOpen) async {
    final current = state.value;
    if (current == null) return;

    final updated = await ref
        .read(storeRepositoryProvider)
        .setOpen(isOpen: isOpen);

    if (ref.mounted) state = AsyncData(updated);
  }

  Future<void> refresh() async {
    final store = await ref.read(storeRepositoryProvider).fetchMine();
    if (ref.mounted) state = AsyncData(store);
  }
}

final myStoreProvider = AsyncNotifierProvider<MyStoreNotifier, Store?>(
  MyStoreNotifier.new,
);
