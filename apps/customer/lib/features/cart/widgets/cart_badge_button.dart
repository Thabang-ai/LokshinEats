/// The basket button, with its item count.
///
/// Lives in one widget because it appears on both the kitchen list and a
/// kitchen's page, and a count that disagreed between the two would be worse
/// than no count at all.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../pages/cart_page.dart';
import '../providers/cart_providers.dart';

class CartBadgeButton extends ConsumerWidget {
  const CartBadgeButton({super.key, this.onSurface});

  /// Set when the button sits over a photo, where the theme's own colour
  /// would disappear.
  final Color? onSurface;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartCountProvider);

    return IconButton(
      onPressed: () => openCart(context),
      tooltip: count == 0 ? 'Your basket' : 'Your basket ($count)',
      icon: Badge(
        // `isLabelVisible` rather than a conditional widget, so the icon does
        // not shift by a pixel when the first item is added.
        isLabelVisible: count > 0,
        label: Text('$count'),
        child: Icon(Icons.shopping_basket_outlined, color: onSurface),
      ),
    );
  }
}

/// Open the basket, leaving no snackbar behind.
///
/// A snackbar belongs to the screen that raised it. Carried into the basket it
/// sits exactly where the checkout button is, and a customer tapping through
/// it hits the toast instead — which is how it was found.
void openCart(BuildContext context) {
  ScaffoldMessenger.of(context).clearSnackBars();
  Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => const CartPage()));
}
