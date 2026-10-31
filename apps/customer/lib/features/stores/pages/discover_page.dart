/// The app's front page, laid out like the website's.
///
/// The hero, what you are craving, who is popular near you, and an invitation
/// to order: the same four sections in the same order as `app/page.tsx`, so
/// the app and the site are recognisably the same shop.
///
/// Nothing here is new machinery. Every control leads to the kitchens tab,
/// which is the browsing screen that already existed, with the search it
/// already had. The one rule followed throughout: no control that does
/// nothing. The website's hero carries a delivery-address box that is not
/// wired to anything; here that space is the search, because a box a customer
/// types into should do what they expect.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/widgets/brand_button.dart';

import '../../shell/providers/shell_providers.dart';
import '../models/food_category.dart';
import '../models/store.dart';
import '../providers/store_providers.dart';
import '../widgets/store_card.dart';
import 'store_detail_page.dart';
import '../widgets/home_header.dart';

class DiscoverPage extends ConsumerWidget {
  const DiscoverPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(storesProvider),
          child: ListView(
            padding: EdgeInsets.zero,
            children: const [
              HomeHeader(),
              _Hero(),
              _Craving(),
              _PopularNearYou(),
              _ReadyToOrder(),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Township Flavors, Delivered to You", over a photograph.
class _Hero extends ConsumerStatefulWidget {
  const _Hero();

  @override
  ConsumerState<_Hero> createState() => _HeroState();
}

class _HeroState extends ConsumerState<_Hero> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _find() {
    ref.read(selectedTabProvider.notifier).searchKitchens(_search.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Stack(
      children: [
        Positioned.fill(
          child: Image.network(
            heroImageUrl,
            fit: BoxFit.cover,
            // A hero that fails to load must not take the words with it.
            errorBuilder: (_, _, _) =>
                const ColoredBox(color: AppColors.charcoal),
          ),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                  Color(0xCC000000),
                  Color(0x99000000),
                  Color(0x4D000000),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 32, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RichText(
                text: TextSpan(
                  style: theme.textTheme.displaySmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    height: 1.1,
                  ),
                  children: const [
                    TextSpan(text: 'Township Flavors,\n'),
                    TextSpan(
                      text: 'Delivered to You',
                      style: TextStyle(color: AppColors.maize),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Experience authentic township cuisine from the best local '
                'restaurants, spaza shops, and home cooks',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(AppTheme.radius + 8),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.2),
                  ),
                ),
                child: Column(
                  children: [
                    TextField(
                      controller: _search,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _find(),
                      decoration: const InputDecoration(
                        hintText: 'Search restaurants, food…',
                        prefixIcon: Icon(Icons.search_rounded),
                        filled: true,
                        fillColor: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      // The site's own `.premium-button` for the one action
                      // this screen exists for.
                      child: BrandButton(
                        onPressed: _find,
                        icon: const Icon(
                          Icons.search_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                        child: const Text('Find Food'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// "What are you craving?" — the eight categories, as on the site.
class _Craving extends ConsumerWidget {
  const _Craving();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'What are you craving?',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 16,
            crossAxisSpacing: 16,
            childAspectRatio: 0.95,
            children: [
              for (final category in foodCategories)
                _CategoryTile(category: category),
            ],
          ),
        ],
      ),
    );
  }
}

class _CategoryTile extends ConsumerWidget {
  const _CategoryTile({required this.category});

  final FoodCategory category;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppTheme.radius),
        onTap: () => ref
            .read(selectedTabProvider.notifier)
            .searchKitchens(category.name),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ClipOval(
                child: SizedBox(
                  width: 92,
                  height: 92,
                  child: Image.network(
                    category.imageUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => ColoredBox(
                      color: theme.colorScheme.surfaceContainerHighest,
                      child: Icon(
                        Icons.restaurant_rounded,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                category.name,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The three best-rated kitchens, which is what the site's home page shows.
class _PopularNearYou extends ConsumerWidget {
  const _PopularNearYou();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final stores = ref.watch(storesProvider);

    return Container(
      width: double.infinity,
      color: AppColors.sand,
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Popular Near You',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(height: 16),
          switch (stores) {
            AsyncData(:final value) when value.isEmpty => Text(
              'No kitchens are open in your area yet. Check back soon.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            AsyncData(:final value) => Column(
              children: [
                for (final store in _bestRated(value))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: StoreCard(
                      store: store,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => StoreDetailPage(storeId: store.id),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            AsyncError() => Text(
              'Could not load kitchens just now. Pull down to try again.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
            _ => const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            ),
          },
        ],
      ),
    );
  }

  /// Three at most, best rated first — the same cut as the website's query.
  List<Store> _bestRated(List<Store> stores) {
    final sorted = [...stores]..sort((a, b) => b.rating.compareTo(a.rating));
    return sorted.take(3).toList(growable: false);
  }
}

/// The closing invitation, in the brand's orange.
class _ReadyToOrder extends ConsumerWidget {
  const _ReadyToOrder();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 44, 24, 48),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.brand, AppColors.brandLight, Color(0xFFFF8B5A)],
        ),
      ),
      child: Column(
        children: [
          Text(
            'Ready to Order?',
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineMedium?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Support local township businesses and enjoy delicious food '
            'delivered to your door',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: Colors.white.withValues(alpha: 0.92),
            ),
          ),
          const SizedBox(height: 28),
          FilledButton(
            onPressed: () =>
                ref.read(selectedTabProvider.notifier).go(HomeTab.kitchens),
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: AppColors.brand,
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 18),
            ),
            child: const Text('Browse Restaurants'),
          ),
        ],
      ),
    );
  }
}
