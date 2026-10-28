/// The bar across the top of the browsing tabs.
///
/// Lifted out of the kitchens list unchanged when the home tab arrived, so
/// both tabs carry the same name, the same bell, the same basket and the same
/// way into an account - rather than the home tab growing a second version
/// that drifts.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/notifications/notification_bell.dart';

import '../../auth/pages/account_page.dart';
import '../../cart/widgets/cart_badge_button.dart';
import '../../orders/pages/your_orders_page.dart';

class HomeHeader extends ConsumerWidget {
  const HomeHeader({super.key});

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
          if (signedIn) const NotificationBell(),
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
