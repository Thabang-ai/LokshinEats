/// Browse kitchens.
///
/// The app's first screen, and deliberately usable signed-out: store and menu
/// browsing are public endpoints, so a customer can look before committing to
/// an account. Signing in is required at checkout, not at the door.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/widgets/async_states.dart';
import '../../auth/pages/account_page.dart';
import '../../cart/widgets/cart_badge_button.dart';
import '../../orders/pages/your_orders_page.dart';
import 'package:lokshineats_core/auth/auth_providers.dart';
import '../models/store.dart';
import '../providers/store_providers.dart';
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
              const SliverToBoxAdapter(child: _Header()),
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

class _Header extends ConsumerWidget {
  const _Header();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final signedIn = ref.watch(isSignedInProvider);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'LokshinEats',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Township food. Delivered.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          // Only for signed-in customers: orders belong to an account, and a
          // button that leads straight to "sign in" adds nothing the account
          // button beside it does not already offer.
          if (signedIn)
            IconButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const YourOrdersPage()),
              ),
              icon: const Icon(Icons.receipt_long_outlined),
              tooltip: 'Your orders',
            ),
          const CartBadgeButton(),

          // Signed out shows an outline; signed in shows a filled icon, so
          // account state is legible without opening the page.
          IconButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const AccountPage()),
            ),
            icon: Icon(
              signedIn
                  ? Icons.account_circle_rounded
                  : Icons.account_circle_outlined,
              size: 30,
              color: signedIn
                  ? theme.colorScheme.primary
                  : theme.colorScheme.onSurfaceVariant,
            ),
            tooltip: signedIn ? 'Your account' : 'Sign in',
          ),
        ],
      ),
    );
  }
}

class _Filters extends StatelessWidget {
  const _Filters({
    required this.openOnly,
    required this.onOpenOnlyChanged,
    required this.onSearchChanged,
  });

  final bool openOnly;
  final ValueChanged<bool> onOpenOnlyChanged;
  final ValueChanged<String> onSearchChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
      child: Column(
        children: [
          TextField(
            onChanged: onSearchChanged,
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              hintText: 'Search kitchens or cuisines',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              FilterChip(
                selected: openOnly,
                onSelected: onOpenOnlyChanged,
                avatar: openOnly
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
