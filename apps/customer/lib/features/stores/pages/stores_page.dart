/// Browse kitchens.
///
/// The app's first screen, and deliberately usable signed-out: store and menu
/// browsing are public endpoints, so a customer can look before committing to
/// an account. Signing in is required at checkout, not at the door.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/widgets/async_states.dart';
import '../models/store.dart';
import '../providers/store_providers.dart';
import '../widgets/home_header.dart';
import '../widgets/store_card.dart';
import 'store_detail_page.dart';

class StoresPage extends ConsumerWidget {
  const StoresPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stores = ref.watch(visibleStoresProvider);
    final openOnly = ref.watch(openOnlyFilterProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          // Invalidating re-runs the request; pulling to refresh is the
          // gesture customers already expect for "is anyone open now".
          onRefresh: () async => ref.invalidate(storesProvider),
          child: CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(child: HomeHeader()),
              SliverToBoxAdapter(
                child: _Filters(
                  openOnly: openOnly,
                  onOpenOnlyChanged: (value) =>
                      ref.read(openOnlyFilterProvider.notifier).set(value),
                  onSearchChanged: (value) =>
                      ref.read(storeSearchQueryProvider.notifier).update(value),
                ),
              ),
              stores.when(
                loading: () => const _LoadingList(),
                error: (error, _) => SliverFillRemaining(
                  hasScrollBody: false,
                  child: ErrorState(
                    error: error,
                    onRetry: () => ref.invalidate(storesProvider),
                  ),
                ),
                data: (list) => list.isEmpty
                    ? SliverFillRemaining(
                        hasScrollBody: false,
                        child: EmptyState(
                          title: openOnly
                              ? 'No kitchens are open right now'
                              : 'No kitchens found',
                          subtitle: openOnly
                              ? 'Turn off "Open now" to see everyone.'
                              : 'Try a different search.',
                        ),
                      )
                    : _StoreList(stores: list),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The search field and the open-now switch.
///
/// The field has a controller rather than just an `onChanged` because the
/// search is no longer only typed here: tapping Kota on the home tab sets it
/// and brings you to this screen, and a filtered list above an empty search
/// box would look broken.
class _Filters extends ConsumerStatefulWidget {
  const _Filters({
    required this.openOnly,
    required this.onOpenOnlyChanged,
    required this.onSearchChanged,
  });

  final bool openOnly;
  final ValueChanged<bool> onOpenOnlyChanged;
  final ValueChanged<String> onSearchChanged;

  @override
  ConsumerState<_Filters> createState() => _FiltersState();
}

class _FiltersState extends ConsumerState<_Filters> {
  late final _search = TextEditingController(
    text: ref.read(storeSearchQueryProvider),
  );

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Only when it was set somewhere else; writing back what was just typed
    // would move the cursor to the end mid-word.
    ref.listen(storeSearchQueryProvider, (_, next) {
      if (next != _search.text) _search.text = next;
    });

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
      child: Column(
        children: [
          TextField(
            controller: _search,
            onChanged: widget.onSearchChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search kitchens or cuisines',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        _search.clear();
                        widget.onSearchChanged('');
                      },
                      icon: const Icon(Icons.close_rounded),
                      tooltip: 'Clear search',
                    ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              FilterChip(
                selected: widget.openOnly,
                onSelected: widget.onOpenOnlyChanged,
                avatar: widget.openOnly
                    ? null
                    : const Icon(Icons.schedule_rounded, size: 18),
                label: const Text('Open now'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StoreList extends StatelessWidget {
  const _StoreList({required this.stores});

  final List<Store> stores;

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      sliver: SliverList.separated(
        itemCount: stores.length,
        separatorBuilder: (_, _) => const SizedBox(height: 16),
        itemBuilder: (context, index) {
          final store = stores[index];
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
    );
  }
}

/// Placeholders shaped like store cards, so the layout does not jump.
class _LoadingList extends StatelessWidget {
  const _LoadingList();

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      sliver: SliverList.separated(
        itemCount: 3,
        separatorBuilder: (_, _) => const SizedBox(height: 16),
        itemBuilder: (context, _) => const Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ShimmerBox(height: 140, radius: 0),
              Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ShimmerBox(width: 180, height: 18),
                    SizedBox(height: 8),
                    ShimmerBox(width: 120, height: 12),
                    SizedBox(height: 14),
                    ShimmerBox(width: 220, height: 12),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
