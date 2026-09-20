/// A kitchen, as it appears in the browse list.
library;

import 'package:flutter/material.dart';

import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';
import '../models/store.dart';

class StoreCard extends StatelessWidget {
  const StoreCard({super.key, required this.store, required this.onTap});

  final Store store;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Banner(store: store),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          store.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (store.hasRating) ...[
                        const SizedBox(width: 8),
                        Icon(
                          Icons.star_rounded,
                          size: 18,
                          color: AppColors.maize,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          store.rating.toStringAsFixed(1),
                          style: theme.textTheme.labelLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          ' (${store.reviewCount})',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (store.cuisine.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      store.cuisine,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  // Wraps rather than truncating: on a narrow phone these
                  // three facts are what decide whether to tap.
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _Fact(icon: Icons.schedule_rounded, label: store.deliveryTime),
                      _Fact(
                        icon: Icons.delivery_dining_rounded,
                        label: '${formatPrice(store.deliveryFee)} delivery',
                      ),
                      if (store.minOrderAmount > 0)
                        _Fact(
                          icon: Icons.shopping_basket_outlined,
                          label: 'Min ${formatPrice(store.minOrderAmount)}',
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.store});

  final Store store;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      height: 140,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (store.hasPhoto)
            Image.network(
              store.image!,
              fit: BoxFit.cover,
              // A broken image URL must not take the card down with it.
              errorBuilder: (context, _, _) => _EmojiBanner(store: store),
              loadingBuilder: (context, child, progress) {
                if (progress == null) return child;
                return ColoredBox(
                  color: theme.colorScheme.surfaceContainerHighest,
                );
              },
            )
          else
            _EmojiBanner(store: store),

          if (!store.isOpen)
            // Not hidden when closed: a customer looking for a specific
            // kitchen should find it and see that it is shut, rather than
            // conclude it no longer exists.
            Container(
              color: Colors.black.withValues(alpha: 0.55),
              alignment: Alignment.center,
              child: const Text(
                'Closed',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  letterSpacing: 0.5,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _EmojiBanner extends StatelessWidget {
  const _EmojiBanner({required this.store});

  final Store store;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            scheme.primary.withValues(alpha: 0.85),
            AppColors.clay.withValues(alpha: 0.85),
          ],
        ),
      ),
      child: Center(
        child: Text(
          store.placeholderEmoji,
          style: const TextStyle(fontSize: 48),
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
