/// The bar that appears at the bottom of a kitchen's page once its basket has
/// something in it.
///
/// Scoped to one kitchen on purpose: a customer browsing a second kitchen with
/// a basket from the first should not be invited to check out the basket they
/// are not looking at. It simply does not appear.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/money.dart';
import '../providers/cart_providers.dart';
import 'cart_badge_button.dart';

class ViewBasketBar extends ConsumerWidget {
  const ViewBasketBar({super.key, required this.storeId});

  /// The kitchen whose page this bar is on.
  final String storeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final theme = Theme.of(context);

    if (cart.isEmpty || cart.storeId != storeId) {
      return const SizedBox.shrink();
    }

    final items = cart.itemCount;

    return Material(
      color: theme.colorScheme.surface,
      elevation: 8,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: FilledButton(
            onPressed: () => openCart(context),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '$items ${items == 1 ? 'item' : 'items'}',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: theme.colorScheme.onPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  'View basket',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: theme.colorScheme.onPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                // The food total only. The delivery fee and the amount actually
                // charged come from the server when the order is placed, so
                // putting a grand total on this button would be a guess.
                Text(
                  formatRands(cart.subtotal),
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: theme.colorScheme.onPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
