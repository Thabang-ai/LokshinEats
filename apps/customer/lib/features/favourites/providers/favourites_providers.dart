/// Which kitchens this customer has favourited.
///
/// Held as a set of store ids, because every screen that cares asks the same
/// question — is this one a favourite — and the answer has to be instant for
/// a heart that fills under the thumb.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/providers.dart';

import '../repositories/favourites_repository.dart';

final favouritesRepositoryProvider = Provider<FavouritesRepository>((ref) {
  return FavouritesRepository(ref.watch(apiClientProvider));
});

class FavouritesNotifier extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() async {
    // Rebuilt on sign-in and sign-out, so one account never sees another's
    // list, and a signed-out browser is simply told to sign in.
    if (!ref.watch(isSignedInProvider)) return const {};

    final ids = await ref.read(favouritesRepositoryProvider).fetch();
    return ids.toSet();
  }

  bool contains(String storeId) => state.value?.contains(storeId) ?? false;

  /// Favourite or un-favourite, showing the change immediately.
  ///
  /// The heart moves before the network answers, because waiting a second to
  /// acknowledge a tap feels broken. If the call fails the change is undone
  /// and the error is thrown on, so the screen can say so rather than leave a
  /// heart that silently lies about what was saved.
  Future<void> toggle(String storeId) async {
    final current = state.value ?? const <String>{};
    final wasFavourite = current.contains(storeId);

    final optimistic = {...current};
    if (wasFavourite) {
      optimistic.remove(storeId);
    } else {
      optimistic.add(storeId);
    }
    state = AsyncData(optimistic);

    final repository = ref.read(favouritesRepositoryProvider);
    try {
      if (wasFavourite) {
        await repository.remove(storeId);
      } else {
        final ids = await repository.add(storeId);
        // The API answers with the whole list, which settles any disagreement
        // between this device and another one.
        state = AsyncData(ids.toSet());
      }
    } catch (_) {
      state = AsyncData(current);
      rethrow;
    }
  }

  /// Re-read the list from the API.
  ///
  /// The current list stays on screen while this runs: pull-to-refresh has
  /// its own spinner, and blanking the page to show a second one would be a
  /// step backwards.
  Future<void> refresh() async {
    state = await AsyncValue.guard(() async {
      final ids = await ref.read(favouritesRepositoryProvider).fetch();
      return ids.toSet();
    });
  }
}

final favouritesProvider =
    AsyncNotifierProvider<FavouritesNotifier, Set<String>>(
      FavouritesNotifier.new,
    );

/// Whether one kitchen is a favourite, for a heart to watch.
final isFavouriteProvider = Provider.family<bool, String>((ref, storeId) {
  return ref.watch(favouritesProvider).value?.contains(storeId) ?? false;
});
