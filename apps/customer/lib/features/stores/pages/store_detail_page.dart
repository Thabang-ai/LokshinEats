/// A kitchen and its menu.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/async_states.dart';
import '../models/product.dart';
import '../models/store.dart';
import '../providers/store_providers.dart';

class StoreDetailPage extends ConsumerWidget {
  const StoreDetailPage({super.key, required this.storeId});

  final String storeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final store = ref.watch(storeProvider(storeId));
    final menu = ref.watch(menuByCategoryProvider(storeId));

    return Scaffold(
      body: store.when(
        loading: () => const _DetailSkeleton(),
        error: (error, _) => SafeArea(
          child: ErrorState(
            error: error,
            onRetry: () => ref.invalidate(storeProvider(storeId)),
          ),
        ),
        data: (data) => CustomScrollView(
          slivers: [
            _StoreAppBar(store: data),
            SliverToBoxAdapter(child: _StoreSummary(store: data)),
            ...menu.when(
              loading: () => [const _MenuSkeleton()],
              error: (error, _) => [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: ErrorState(
                    error: error,
                    onRetry: () => ref.invalidate(storeMenuProvider(storeId)),
                  ),
                ),
              ],
              data: (grouped) => grouped.isEmpty
                  ? [
                      const SliverFillRemaining(
                        hasScrollBody: false,
                        child: EmptyState(
                          title: 'Nothing on the menu yet',
                          subtitle:
                              'This kitchen has not added any dishes. Check back soon.',
                          emoji: '👩🏾‍🍳',
                        ),
                      ),
                    ]
                  : _menuSlivers(grouped),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _menuSlivers(Map<String, List<Product>> grouped) {
    final slivers = <Widget>[];

    for (final entry in grouped.entries) {
      slivers.add(
        SliverToBoxAdapter(child: _CategoryHeading(label: entry.key)),
      );
      slivers.add(
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          sliver: SliverList.separated(
            itemCount: entry.value.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, index) =>
                _MenuItem(product: entry.value[index]),
          ),
        ),
      );
    }

    slivers.add(const SliverToBoxAdapter(child: SizedBox(height: 32)));
    return slivers;
  }
}

class _StoreAppBar extends StatelessWidget {
  const _StoreAppBar({required this.store});

  final Store store;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return SliverAppBar(
      expandedHeight: 200,
      pinned: true,
      flexibleSpace: FlexibleSpaceBar(
        title: Text(
          store.name,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        background: Stack(
          fit: StackFit.expand,
          children: [
            if (store.hasPhoto)
              Image.network(
                store.image!,
                fit: BoxFit.cover,
                errorBuilder: (context, _, _) => _Gradient(store: store),
              )
            else
              _Gradient(store: store),

            // A scrim so the pinned title stays readable over any photo.
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    scheme.scrim.withValues(alpha: 0.75),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Gradient extends StatelessWidget {
  const _Gradient({required this.store});

  final Store store;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [scheme.primary, AppColors.clay],
        ),
      ),
      child: Center(
        child: Text(
          store.placeholderEmoji,
          style: const TextStyle(fontSize: 64),
        ),
      ),
    );
  }
}

class _StoreSummary extends StatelessWidget {
  const _StoreSummary({required this.store});

  final Store store;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!store.isOpen)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(AppTheme.radius),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.schedule_rounded,
                    size: 18,
                    color: theme.colorScheme.onErrorContainer,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Closed right now — you can look, but not order yet.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onErrorContainer,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          if (store.description.isNotEmpty) ...[
            Text(store.description, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 14),
          ],

          Wrap(
            spacing: 16,
            runSpacing: 8,
            children: [
              if (store.hasRating)
                _Stat(
                  icon: Icons.star_rounded,
                  iconColor: AppColors.maize,
                  label: '${store.rating.toStringAsFixed(1)} (${store.reviewCount})',
                ),
              _Stat(icon: Icons.schedule_rounded, label: store.deliveryTime),
              _Stat(
                icon: Icons.delivery_dining_rounded,
                label: '${formatPrice(store.deliveryFee)} delivery',
              ),
              if (store.minOrderAmount > 0)
                _Stat(
                  icon: Icons.shopping_basket_outlined,
                  label: 'Min ${formatPrice(store.minOrderAmount)}',
                ),
            ],
          ),

          if (store.address.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(
                  Icons.place_outlined,
                  size: 16,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    [store.address, store.city]
                        .where((part) => part.isNotEmpty)
                        .join(', '),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.label, this.iconColor});

  final IconData icon;
  final String label;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 17,
          color: iconColor ?? theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: 5),
        Text(label, style: theme.textTheme.bodySmall),
      ],
    );
  }
}

class _CategoryHeading extends StatelessWidget {
  const _CategoryHeading({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  const _MenuItem({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          product.name,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (product.isVegetarian) const _Tag(emoji: '🌱'),
                      if (product.isSpicy) const _Tag(emoji: '🌶️'),
                    ],
                  ),
                  if (product.description.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      product.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Text(
                    formatPrice(product.price),
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            // Adding to a cart is the next slice of work; the affordance is
            // here so the layout is settled, and it says so rather than
            // pretending to work.
            IconButton.filledTonal(
              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Cart and checkout are coming next.'),
                ),
              ),
              icon: const Icon(Icons.add_rounded),
              tooltip: 'Add to cart',
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.emoji});

  final String emoji;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: Text(emoji, style: const TextStyle(fontSize: 13)),
    );
  }
}

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();

  @override
  Widget build(BuildContext context) {
    return const SafeArea(
      child: Padding(
        padding: EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ShimmerBox(height: 160, radius: 16),
            SizedBox(height: 20),
            ShimmerBox(width: 200, height: 22),
            SizedBox(height: 10),
            ShimmerBox(width: 140, height: 14),
          ],
        ),
      ),
    );
  }
}

class _MenuSkeleton extends StatelessWidget {
  const _MenuSkeleton();

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      sliver: SliverList.separated(
        itemCount: 4,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, _) => const Card(
          child: Padding(
            padding: EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ShimmerBox(width: 160, height: 16),
                SizedBox(height: 8),
                ShimmerBox(width: 220, height: 12),
                SizedBox(height: 10),
                ShimmerBox(width: 60, height: 14),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
