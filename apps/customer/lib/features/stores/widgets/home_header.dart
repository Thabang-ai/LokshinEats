/// The bar across the top of the browsing tabs.
///
/// Lifted out of the kitchens list unchanged when the home tab arrived, so
/// both tabs carry the same name, the same bell, the same basket and the same
/// way into an account - rather than the home tab growing a second version
/// that drifts.
///
/// One row, the way the website's header is one row: badge, name, buttons.
/// It used to be a two-line block of headline text beside four full-size
/// buttons, which on a real phone left the name about 120dp to live in - so
/// it wrapped mid-word and sat on top of the tagline under it. The tagline is
/// gone with it: the badge already carries those words, and the hero below
/// says them again at full size.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';
import 'package:lokshineats_core/notifications/notification_bell.dart';
import 'package:lokshineats_core/widgets/brand_mark.dart';

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
      padding: const EdgeInsets.fromLTRB(16, 12, 6, 8),
      child: Row(
        children: [
          // Takes the room the buttons leave, and gives it to the name, which
          // shortens itself rather than wrapping if a phone is narrow enough.
          const Expanded(child: BrandMark()),

          // Four buttons at their full 48dp is 192dp of a 360dp screen. Compact
          // is the difference between the name fitting and not.
          IconButtonTheme(
            data: IconButtonThemeData(
              style: IconButton.styleFrom(
                visualDensity: VisualDensity.compact,
                iconSize: 22,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Only for signed-in customers: orders belong to an account,
                // and a button that leads straight to "sign in" adds nothing
                // the account button beside it does not already offer.
                if (signedIn)
                  IconButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const YourOrdersPage(),
                      ),
                    ),
                    icon: const Icon(Icons.receipt_long_outlined),
                    tooltip: 'Your orders',
                  ),
                if (signedIn) const NotificationBell(),
                const CartBadgeButton(),

                // Signed out shows an outline; signed in shows a filled icon,
                // so account state is legible without opening the page.
                IconButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const AccountPage()),
                  ),
                  icon: Icon(
                    signedIn
                        ? Icons.account_circle_rounded
                        : Icons.account_circle_outlined,
                    color: signedIn
                        ? theme.colorScheme.primary
                        : theme.colorScheme.onSurfaceVariant,
                  ),
                  tooltip: signedIn ? 'Your account' : 'Sign in',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
