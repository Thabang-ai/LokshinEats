/// The app's home, with the website's bottom navigation.
///
/// The site carries Home, Search, Orders, Favorites and Profile along the
/// bottom, and someone who orders on the site should find the app laid out
/// the way they already know it.
///
/// Home and Search were one tab until the home tab became the site's front
/// page - the hero, the categories, who is popular - which left the list of
/// kitchens needing a tab of its own. That is Search, and it is the same
/// browsing screen as before, searching and filtering exactly as it did.
///
/// Tabs keep their state while you move between them, so a half-typed search
/// or a scrolled list is still there when you come back.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';

import '../../auth/pages/account_page.dart';
import '../../favourites/pages/favourites_page.dart';
import '../../orders/pages/your_orders_page.dart';
import '../../stores/pages/discover_page.dart';
import '../../stores/pages/stores_page.dart';
import '../providers/shell_providers.dart';

class HomeShell extends ConsumerWidget {
  const HomeShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Orders and favourites both need an account. Rather than offer tabs that
    // can only say "sign in", a signed-out customer gets browsing and the
    // account tab, which is where signing in happens.
    final signedIn = ref.watch(isSignedInProvider);

    final destinations = <_Destination>[
      const _Destination(
        tab: HomeTab.home,
        icon: Icons.home_outlined,
        selectedIcon: Icons.home_rounded,
        label: 'Home',
        page: DiscoverPage(),
      ),
      const _Destination(
        tab: HomeTab.kitchens,
        icon: Icons.search_rounded,
        selectedIcon: Icons.search_rounded,
        label: 'Search',
        page: StoresPage(),
      ),
      if (signedIn) ...[
        const _Destination(
          tab: HomeTab.orders,
          icon: Icons.receipt_long_outlined,
          selectedIcon: Icons.receipt_long_rounded,
          label: 'Orders',
          page: YourOrdersPage(),
        ),
        const _Destination(
          tab: HomeTab.favourites,
          icon: Icons.favorite_border_rounded,
          selectedIcon: Icons.favorite_rounded,
          label: 'Favourites',
          page: FavouritesPage(),
        ),
      ],
      const _Destination(
        tab: HomeTab.account,
        icon: Icons.person_outline_rounded,
        selectedIcon: Icons.person_rounded,
        label: 'Account',
        page: AccountPage(),
      ),
    ];

    // Signing out removes two tabs. Holding the tab by name rather than by
    // number means whoever was on one of them lands on Home instead of on
    // whatever has shuffled into that position.
    final selected = ref.watch(selectedTabProvider);
    final found = destinations.indexWhere((d) => d.tab == selected);
    final index = found == -1 ? 0 : found;

    return Scaffold(
      body: IndexedStack(
        index: index,
        children: [for (final destination in destinations) destination.page],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (next) => ref
            .read(selectedTabProvider.notifier)
            .go(destinations[next].tab),
        destinations: [
          for (final destination in destinations)
            NavigationDestination(
              icon: Icon(destination.icon),
              selectedIcon: Icon(destination.selectedIcon),
              label: destination.label,
            ),
        ],
      ),
    );
  }
}

class _Destination {
  const _Destination({
    required this.tab,
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.page,
  });

  final HomeTab tab;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final Widget page;
}
