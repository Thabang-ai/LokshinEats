/// The kitchens a customer has saved.
///
/// Favourites are stored as ids, so this fetches each kitchen as it stands
/// now: prices, opening state and photos are current, and one that has been
/// removed simply drops off the list instead of lingering as a stale copy.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

import '../../stores/models/store.dart';
import '../../stores/pages/store_detail_page.dart';
import '../../stores/providers/store_providers.dart';
import '../../stores/widgets/store_card.dart';
import '../providers/favourites_providers.dart';

/// The saved kitchens themselves, fetched one by one from their ids.
///
/// A kitchen that cannot be fetched is dropped rather than failing the whole
/// screen: one deleted store should not empty somebody's list.
final favouriteStoresProvider = FutureProvider<List<Store>>((ref) async {
  final ids = await ref.watch(favouritesProvider.future);
  if (ids.isEmpty) return const [];

  final results = await Future.wait([
    for (final id in ids)
      ref
          .read(storeRepositoryProvider)
          .fetchStore(id)
          .then<Store?>((store) => store)
          .catchError((_) => null),
  ]);

  return [for (final store in results) ?store];
});

class FavouritesPage extends ConsumerWidget {
  const FavouritesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(isSignedInProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Favourites')),
      body: signedIn
          ? _SavedKitchens(onRefresh: () => _refresh(ref))
          : const EmptyState(
              emoji: '❤️',
              title: 'Sign in to save favourites',
              subtitle:
                  'Kitchens you save are kept on your account, so they are '
                  'there on every device you sign in on.',
            ),
    );
  }

  Future<void> _refresh(WidgetRef ref) async {
    await ref.read(favouritesProvider.notifier).refresh();
    ref.invalidate(favouriteStoresProvider);
    await ref.read(favouriteStoresProvider.future);
  }
}

class _SavedKitchens extends ConsumerWidget {
  const _SavedKitchens({required this.onRefresh});

  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stores = ref.watch(favouriteStoresProvider);

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: stores.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ListView(
          children: [
            const SizedBox(height: 80),
            ErrorState(error: error, onRetry: onRefresh),
          ],
        ),
        data: (saved) => saved.isEmpty
            ? ListView(
                children: const [
                  SizedBox(height: 80),
                  EmptyState(
                    emoji: '❤️',
                    title: 'No favourites yet',
                    subtitle:
                        'Tap the heart on a kitchen to keep it here, ready '
                        'for the next time you are hungry.',
                  ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: saved.length,
                separatorBuilder: (_, _) => const SizedBox(height: 16),
                itemBuilder: (context, index) {
                  final store = saved[index];
                  return StoreCard(
                    store: store,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => StoreDetailPage(storeId: store.id),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
